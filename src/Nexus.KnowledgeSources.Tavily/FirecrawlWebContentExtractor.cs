using System.Net.Http.Json;
using System.Text.Json.Serialization;
using Nexus.KnowledgeSources.Abstractions;

namespace Nexus.KnowledgeSources.Tavily;

/// <summary>
/// Extrai o conteudo textual de uma URL via Firecrawl self-hosted local
/// (POST /v1/scrape). Substitui o extrator Tavily para eliminar custos de API externa.
/// </summary>
public class FirecrawlWebContentExtractor(
    IHttpClientFactory httpClientFactory
) : IWebContentExtractor
{
    public const string HttpClientName = "Firecrawl";

    public async Task<string> ExtractAsync(string url, CancellationToken ct)
    {
        var client = httpClientFactory.CreateClient(HttpClientName);
        client.BaseAddress ??= new Uri("http://firecrawl-api-1:3002");

        var request = new FirecrawlScrapeRequest(url, ["markdown"]);

        using var response = await client.PostAsJsonAsync("/v1/scrape", request, ct);
        response.EnsureSuccessStatusCode();

        var payload =
            await response.Content.ReadFromJsonAsync<FirecrawlScrapeResponse>(cancellationToken: ct)
            ?? throw new InvalidOperationException("Resposta vazia da API do Firecrawl.");

        if (payload?.Data?.Markdown is null)
        {
            throw new InvalidOperationException(
                $"Firecrawl nao conseguiu extrair conteudo da URL '{url}'."
            );
        }

        return payload.Data.Markdown;
    }

    private record FirecrawlScrapeRequest(
        [property: JsonPropertyName("url")] string Url,
        [property: JsonPropertyName("formats")] string[] Formats
    );

    private record FirecrawlScrapeResponse(
        [property: JsonPropertyName("success")] bool Success,
        [property: JsonPropertyName("data")] FirecrawlData? Data
    );

    private record FirecrawlData(
        [property: JsonPropertyName("markdown")] string? Markdown
    );
}
