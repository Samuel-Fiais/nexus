using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using Nexus.Llm.Abstractions;

namespace Nexus.Llm.DeepSeek;

public class DeepSeekLlmProvider(
    IHttpClientFactory httpClientFactory,
    IOptions<DeepSeekOptions> options
) : ILlmProvider
{
    public const string HttpClientName = "DeepSeek";

    private readonly DeepSeekOptions _options = options.Value;

    public async Task<LlmResult> GenerateAnswerAsync(
        string systemPrompt,
        string userPrompt,
        CancellationToken ct
    )
    {
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            throw new InvalidOperationException(
                "DeepSeek API key nao configurada. Defina DeepSeek:ApiKey (env var DeepSeek__ApiKey)."
            );
        }

        var client = httpClientFactory.CreateClient(HttpClientName);
        client.BaseAddress ??= new Uri(_options.BaseUrl);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            _options.ApiKey
        );

        var request = new DeepSeekChatRequest(
            _options.Model,
            new[]
            {
                new DeepSeekMessage("system", systemPrompt),
                new DeepSeekMessage("user", userPrompt),
            },
            false
        );

        using var response = await client.PostAsJsonAsync("chat/completions", request, ct);
        response.EnsureSuccessStatusCode();

        var payload =
            await response.Content.ReadFromJsonAsync<DeepSeekChatResponse>(cancellationToken: ct)
            ?? throw new InvalidOperationException("Resposta vazia da API da DeepSeek.");

        var answer = payload.Choices.FirstOrDefault()?.Message.Content ?? string.Empty;
        var cachedTokens = payload.Usage?.PromptCacheHitTokens;
        var cost = CalculateCostUsd(payload.Usage);

        return new LlmResult(
            answer,
            payload.Usage?.PromptTokens,
            payload.Usage?.CompletionTokens,
            payload.Model ?? _options.Model,
            cachedTokens,
            cost
        );
    }

    private decimal? CalculateCostUsd(DeepSeekUsage? usage)
    {
        if (usage is null)
        {
            return null;
        }

        var cacheHitTokens = usage.PromptCacheHitTokens ?? 0;
        var cacheMissTokens = usage.PromptCacheMissTokens ?? Math.Max(0, (usage.PromptTokens ?? 0) - cacheHitTokens);
        var outputTokens = usage.CompletionTokens ?? 0;

        return cacheHitTokens / 1_000_000m * _options.PriceCacheHitPerMillionUsd
            + cacheMissTokens / 1_000_000m * _options.PriceCacheMissPerMillionUsd
            + outputTokens / 1_000_000m * _options.PriceOutputPerMillionUsd;
    }

    private record DeepSeekChatRequest(
        [property: JsonPropertyName("model")] string Model,
        [property: JsonPropertyName("messages")] DeepSeekMessage[] Messages,
        [property: JsonPropertyName("stream")] bool Stream
    );

    private record DeepSeekMessage(
        [property: JsonPropertyName("role")] string Role,
        [property: JsonPropertyName("content")] string Content
    );

    private record DeepSeekChatResponse(
        [property: JsonPropertyName("model")] string? Model,
        [property: JsonPropertyName("choices")] List<DeepSeekChoice> Choices,
        [property: JsonPropertyName("usage")] DeepSeekUsage? Usage
    );

    private record DeepSeekChoice([property: JsonPropertyName("message")] DeepSeekMessage Message);

    private record DeepSeekUsage(
        [property: JsonPropertyName("prompt_tokens")] int? PromptTokens,
        [property: JsonPropertyName("completion_tokens")] int? CompletionTokens,
        [property: JsonPropertyName("prompt_cache_hit_tokens")] int? PromptCacheHitTokens,
        [property: JsonPropertyName("prompt_cache_miss_tokens")] int? PromptCacheMissTokens
    );
}
