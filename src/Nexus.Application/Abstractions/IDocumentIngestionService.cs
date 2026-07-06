using Nexus.Domain.Enums;

namespace Nexus.Application.Abstractions;

/// <summary>
/// Ingestao/indexacao de um item de uma fonte de conhecimento: hash, chunking, embeddings,
/// auto-tagging e persistencia de Document + DocumentChunk + Tag/DocumentTag (Epico 6).
/// </summary>
public interface IDocumentIngestionService
{
    /// <summary>
    /// Indexa (ou reindexa) o conteudo informado. Retorna true se o documento foi (re)indexado,
    /// false se foi pulado por estar inalterado desde a ultima sincronizacao.
    /// </summary>
    Task<bool> IngestAsync(
        Guid sourceId,
        string externalId,
        string title,
        DocumentContentType contentType,
        string content,
        CancellationToken ct
    );
}
