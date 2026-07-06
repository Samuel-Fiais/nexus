using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;
using Nexus.KnowledgeSources.Abstractions;

namespace Nexus.KnowledgeSources.Tavily;

/// <summary>
/// Extrai o conteudo textual de uma URL via endpoint web_extract da Tavily
/// (POST /extract). Usado na ingestao de documentos do tipo WebsiteLink.
/// </summary>
public class TavilyWebContentExtractor(
    IHttpClientFactory httpClientFactory,
    IOptions<TavilyOptions> options
) : IWebContentExtractor
{
    public const string HttpClientName = "Tavily";

    private readonly TavilyOptions _options = options.Value;

    public async Task<string> ExtractAsync(string url, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(_options.ApiKey))
        {
            throw new InvalidOperationException(
                "Tavily API key nao configurada. Defina Tavily:ApiKey (env var Tavily__ApiKey)."
            );
        }

        var client = httpClientFactory.CreateClient(HttpClientName);
        client.BaseAddress ??= new Uri(_options.BaseUrl);
        client.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue(
            "Bearer",
            _options.ApiKey
        );

        var request = new TavilyExtractRequest([url]);

        using var response = await client.PostAsJsonAsync("extract", request, ct);
        response.EnsureSuccessStatusCode();

        var payload =
            await response.Content.ReadFromJsonAsync<TavilyExtractResponse>(cancellationToken: ct)
            ?? throw new InvalidOperationException("Resposta vazia da API da Tavily.");

        var result = payload.Results?.FirstOrDefault();
        if (result is null || string.IsNullOrWhiteSpace(result.RawContent))
        {
            var failure = payload.FailedResults?.FirstOrDefault();
            var reason = failure?.Error is { Length: > 0 }
                ? failure.Error
                : "nenhum motivo informado pela API.";

            throw new InvalidOperationException(
                $"Tavily nao conseguiu extrair conteudo da URL '{url}'. Motivo: {reason}"
            );
        }

        return result.RawContent;
    }

    private record TavilyExtractRequest([property: JsonPropertyName("urls")] string[] Urls);

    private record TavilyExtractResponse(
        [property: JsonPropertyName("results")] List<TavilyExtractResult>? Results,
        [property: JsonPropertyName("failed_results")] List<TavilyExtractFailure>? FailedResults
    );

    private record TavilyExtractResult(
        [property: JsonPropertyName("url")] string? Url,
        [property: JsonPropertyName("raw_content")] string? RawContent
    );

    private record TavilyExtractFailure(
        [property: JsonPropertyName("url")] string? Url,
        [property: JsonPropertyName("error")] string? Error
    );
}
