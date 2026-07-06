using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Nexus.Llm.Abstractions;
using Nexus.Persistence;
using Nexus.Slack;

namespace Nexus.Tests.Api;

/// <summary>
/// Tasks 11.4/11.5: integracao via POST /slack/events — url_verification, assinatura
/// invalida (401) e idempotencia de eventos duplicados — com LLM e notifier mockados.
/// </summary>
public class SlackEventsIntegrationTests : IDisposable
{
    private const string SigningSecret = "test-signing-secret";

    private readonly string _dbPath;
    private readonly string _knowledgePath;
    private readonly WebApplicationFactory<Program> _factory;
    private readonly FakeSlackNotifier _notifier = new();

    private class FakeLlmProvider : ILlmProvider
    {
        public Task<LlmResult> GenerateAnswerAsync(
            string systemPrompt,
            string userPrompt,
            CancellationToken ct
        ) => Task.FromResult(new LlmResult("Resposta de teste.", 10, 5, "fake-model"));
    }

    private class FakeSlackNotifier : ISlackNotifier
    {
        public List<(string ChannelId, string Text)> Posts { get; } = [];

        public Task PostMessageAsync(
            string channelId,
            string? threadTs,
            string text,
            CancellationToken ct
        )
        {
            Posts.Add((channelId, text));
            return Task.CompletedTask;
        }
    }

    public SlackEventsIntegrationTests()
    {
        var runId = Guid.NewGuid().ToString("N");
        _dbPath = Path.Combine(Path.GetTempPath(), $"nexus-api-tests-{runId}.db");
        _knowledgePath = Path.Combine(Path.GetTempPath(), $"nexus-api-tests-{runId}-knowledge");

        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("ConnectionStrings:Default", $"Data Source={_dbPath}");
            builder.UseSetting("Knowledge:LocalFolderPath", _knowledgePath);
            builder.UseSetting("Slack:SigningSecret", SigningSecret);
            builder.ConfigureServices(services =>
            {
                services.RemoveAll<IHostedService>();
                services.RemoveAll<ILlmProvider>();
                services.AddSingleton<ILlmProvider, FakeLlmProvider>();
                services.RemoveAll<ISlackNotifier>();
                services.AddSingleton<ISlackNotifier>(_notifier);
            });
        });

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<NexusDbContext>();
        db.Database.Migrate();
    }

    public void Dispose()
    {
        _factory.Dispose();
        foreach (var suffix in new[] { "", "-shm", "-wal" })
        {
            var path = _dbPath + suffix;
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }

        if (Directory.Exists(_knowledgePath))
        {
            Directory.Delete(_knowledgePath, recursive: true);
        }
    }

    private static string Sign(string timestamp, string body)
    {
        var baseString = $"v0:{timestamp}:{body}";
        var hash = HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(SigningSecret),
            Encoding.UTF8.GetBytes(baseString)
        );
        return "v0=" + Convert.ToHexString(hash).ToLowerInvariant();
    }

    private static HttpRequestMessage BuildSignedRequest(string body, string? signature = null)
    {
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var request = new HttpRequestMessage(HttpMethod.Post, "/slack/events")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("X-Slack-Request-Timestamp", timestamp);
        request.Headers.Add("X-Slack-Signature", signature ?? Sign(timestamp, body));
        return request;
    }

    private static string MessageEventBody(string eventId) =>
        JsonSerializer.Serialize(
            new
            {
                type = "event_callback",
                event_id = eventId,
                team_id = "T123",
                @event = new
                {
                    type = "message",
                    user = "U123",
                    text = "Como solicito ferias?",
                    channel = "C123",
                },
            }
        );

    [Fact]
    public async Task Url_Verification_Returns_Challenge_Without_Signature()
    {
        var client = _factory.CreateClient();
        var body = """{"type":"url_verification","challenge":"abc123"}""";

        var response = await client.PostAsync(
            "/slack/events",
            new StringContent(body, Encoding.UTF8, "application/json")
        );

        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadAsStringAsync();
        Assert.Contains("abc123", payload);
    }

    [Fact]
    public async Task Invalid_Signature_Returns_Unauthorized()
    {
        var client = _factory.CreateClient();
        var request = BuildSignedRequest(MessageEventBody("EvBad"), signature: "v0=invalido");

        var response = await client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
    }

    [Fact]
    public async Task Duplicate_Events_Create_Single_Interaction()
    {
        var client = _factory.CreateClient();
        var body = MessageEventBody("EvDup1");

        var first = await client.SendAsync(BuildSignedRequest(body));
        var second = await client.SendAsync(BuildSignedRequest(body));

        var firstBody = await first.Content.ReadAsStringAsync();
        var secondBody = await second.Content.ReadAsStringAsync();

        Assert.True(
            first.IsSuccessStatusCode,
            $"Primeira resposta inesperada: {(int)first.StatusCode} {first.StatusCode}\n{firstBody}"
        );
        Assert.True(
            second.IsSuccessStatusCode,
            $"Segunda resposta inesperada: {(int)second.StatusCode} {second.StatusCode}\n{secondBody}"
        );

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<NexusDbContext>();
        var interactions = new List<Nexus.Domain.Entities.Interaction>();
        for (var i = 0; i < 100; i++)
        {
            interactions = db.Interactions.Where(x => x.SlackEventId == "EvDup1").ToList();
            if (interactions.Count > 0)
            {
                break;
            }

            await Task.Delay(50);
        }

        Assert.Single(interactions);
    }
}
