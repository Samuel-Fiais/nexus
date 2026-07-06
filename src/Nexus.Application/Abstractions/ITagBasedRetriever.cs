namespace Nexus.Application.Abstractions;

/// <summary>
/// Dado um conjunto de slugs de tags, retorna os ids dos documentos vinculados via DocumentTag,
/// considerando apenas documentos indexados de fontes ativas (regra 7.2).
/// </summary>
public interface ITagBasedRetriever
{
    Task<IReadOnlyList<Guid>> GetDocumentIdsByTagSlugsAsync(
        IReadOnlyCollection<string> tagSlugs,
        CancellationToken ct
    );
}
