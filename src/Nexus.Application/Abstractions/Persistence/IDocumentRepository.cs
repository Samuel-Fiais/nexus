using Nexus.Domain.Entities;

namespace Nexus.Application.Abstractions.Persistence;

public interface IDocumentRepository
{
    Task<Document?> GetByIdAsync(Guid id, CancellationToken ct);

    Task<Document?> GetBySourceAndExternalIdAsync(
        Guid sourceId,
        string externalId,
        CancellationToken ct
    );

    Task<IReadOnlyList<Document>> GetByTitlesAsync(
        IReadOnlyCollection<string> titles,
        CancellationToken ct
    );

    Task<IReadOnlyList<Document>> SearchByTitleTermsAsync(
        IReadOnlyCollection<string> terms,
        CancellationToken ct
    );

    Task AddAsync(Document document, CancellationToken ct);

    Task UpdateAsync(Document document, CancellationToken ct);
}
