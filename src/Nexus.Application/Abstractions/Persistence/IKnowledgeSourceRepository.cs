using Nexus.Domain.Entities;

namespace Nexus.Application.Abstractions.Persistence;

public interface IKnowledgeSourceRepository
{
    Task<IReadOnlyList<KnowledgeSource>> GetAllAsync(CancellationToken ct);

    Task<IReadOnlyList<KnowledgeSource>> GetActiveAsync(CancellationToken ct);

    Task<KnowledgeSource?> GetByIdAsync(Guid id, CancellationToken ct);

    Task AddAsync(KnowledgeSource source, CancellationToken ct);

    Task UpdateAsync(KnowledgeSource source, CancellationToken ct);

    Task<bool> DeleteAsync(Guid id, CancellationToken ct);
}
