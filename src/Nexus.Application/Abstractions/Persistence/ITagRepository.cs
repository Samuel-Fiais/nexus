using Nexus.Domain.Entities;

namespace Nexus.Application.Abstractions.Persistence;

public interface ITagRepository
{
    Task<Tag?> GetBySlugAsync(string slug, CancellationToken ct);

    Task<IReadOnlyList<Tag>> GetAllAsync(CancellationToken ct);

    Task AddAsync(Tag tag, CancellationToken ct);

    /// <summary>
    /// Substitui as tags de um documento pelas informadas (nomes livres), criando as Tags
    /// que ainda nao existem (upsert por slug). Regras 6.10/6.11.
    /// </summary>
    Task ReplaceDocumentTagsAsync(
        Guid documentId,
        IReadOnlyList<string> tagNames,
        CancellationToken ct
    );
}
