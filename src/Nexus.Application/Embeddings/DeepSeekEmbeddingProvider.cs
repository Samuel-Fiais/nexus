using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Nexus.Application.Abstractions;
using Nexus.Llm.DeepSeek;

namespace Nexus.Application.Embeddings;

public class DeepSeekEmbeddingProvider(
    IHttpClientFactory httpClientFactory,
    IOptions<DeepSeekOptions> options,
    ILogger<DeepSeekEmbeddingProvider> logger
) : IEmbeddingProvider
{
    public const string HttpClientName = "DeepSeekEmbedding";

    private const string PrimaryModel = "text-embedding-v3";
    private const string FallbackModel = "deepseek-embedding";

    private readonly DeepSeekOptions _options = options.Value;

    public async Task<float[]> GenerateEmbeddingAsync(string text, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            logger.LogWarning(
                "DeepSeek API key nao configurada. Usando embedding local por hashing."
            );
            return HashingEmbeddingProvider.GenerateEmbedding(text);
        }

        try
        {
            return await GenerateEmbeddingAsync(text, PrimaryModel, ct);
        }
        catch (Exception primaryEx) when (!ct.IsCancellationRequested)
        {
            try
            {
                return await GenerateEmbeddingAsync(text, FallbackModel, ct);
            }
            catch (Exception fallbackEx) when (!ct.IsCancellationRequested)
            {
                logger.LogWarning(
                    fallbackEx,
                    "Falha ao gerar embedding via DeepSeek com os modelos {PrimaryModel} e {FallbackModel}. Usando embedding local por hashing. Erro inicial: {PrimaryError}",
                    PrimaryModel,
                    FallbackModel,
                    primaryEx.Message
                );

                return HashingEmbeddingProvider.GenerateEmbedding(text);
            }
        }
    }

    private async Task<float[]> GenerateEmbeddingAsync(
        string text,
        string model,
        CancellationToken ct
    )
    {
        var client = httpClientFactory.CreateClient(HttpClientName);
        client.BaseAddress ??= new Uri(_options.BaseUrl.TrimEnd('/') + "/");
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            _options.ApiKey
        );

        var request = new DeepSeekEmbeddingRequest(model, text);

        using var response = await client.PostAsJsonAsync("v1/embeddings", request, ct);
        response.EnsureSuccessStatusCode();

        var payload =
            await response.Content.ReadFromJsonAsync<DeepSeekEmbeddingResponse>(
                cancellationToken: ct
            )
            ?? throw new InvalidOperationException("Resposta vazia da API da DeepSeek.");

        return payload.Data.FirstOrDefault()?.Embedding
            ?? throw new InvalidOperationException("Resposta da DeepSeek sem embedding.");
    }

    private record DeepSeekEmbeddingRequest(
        [property: JsonPropertyName("model")] string Model,
        [property: JsonPropertyName("input")] string Input
    );

    private record DeepSeekEmbeddingResponse(
        [property: JsonPropertyName("data")] List<DeepSeekEmbeddingData> Data,
        [property: JsonPropertyName("model")] string? Model,
        [property: JsonPropertyName("usage")] DeepSeekEmbeddingUsage? Usage
    );

    private record DeepSeekEmbeddingData(
        [property: JsonPropertyName("embedding")] float[] Embedding
    );

    private record DeepSeekEmbeddingUsage(
        [property: JsonPropertyName("prompt_tokens")] int? PromptTokens,
        [property: JsonPropertyName("total_tokens")] int? TotalTokens
    );
}
