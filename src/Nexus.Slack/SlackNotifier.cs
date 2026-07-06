using System.Net.Http.Headers;
using System.Net.Http.Json;
using Microsoft.Extensions.Options;

namespace Nexus.Slack;

public class SlackNotifier(IHttpClientFactory httpClientFactory, IOptions<SlackOptions> options)
    : ISlackNotifier
{
    public const string HttpClientName = "Slack";

    private readonly SlackOptions _options = options.Value;

    public async Task PostMessageAsync(
        string channelId,
        string? threadTs,
        string text,
        CancellationToken ct
    )
    {
        if (string.IsNullOrWhiteSpace(_options.BotToken))
        {
            throw new InvalidOperationException(
                "Slack bot token nao configurado. Defina Slack:BotToken (env var Slack__BotToken)."
            );
        }

        var client = httpClientFactory.CreateClient(HttpClientName);
        client.BaseAddress ??= new Uri("https://slack.com/api/");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            _options.BotToken
        );

        var payload = new
        {
            channel = channelId,
            thread_ts = threadTs,
            text = SlackMessageFormatter.ToSlackMrkdwn(text),
        };

        using var response = await client.PostAsJsonAsync("chat.postMessage", payload, ct);
        response.EnsureSuccessStatusCode();
    }
}
