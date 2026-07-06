namespace Nexus.KnowledgeSources.Abstractions;

/// <summary>
/// Extrai o conteudo textual de uma pagina web (usado por documentos do tipo WebsiteLink).
/// Implementacao atual: Tavily web_extract (Nexus.KnowledgeSources.Tavily).
/// </summary>
public interface IWebContentExtractor
{
    Task<string> ExtractAsync(string url, CancellationToken ct);
}
