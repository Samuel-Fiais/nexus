using Microsoft.EntityFrameworkCore;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Domain.Entities;

namespace Nexus.Persistence.Repositories;

public class KnowledgeSourceRepository(NexusDbContext db) : IKnowledgeSourceRepository
{
    public async Task<IReadOnlyList<KnowledgeSource>> GetAllAsync(CancellationToken ct) =>
        await db.KnowledgeSources.OrderBy(s => s.Name).ToListAsync(ct);

    public async Task<IReadOnlyList<KnowledgeSource>> GetActiveAsync(CancellationToken ct) =>
        await db.KnowledgeSources.Where(s => s.Active).ToListAsync(ct);

    public Task<KnowledgeSource?> GetByIdAsync(Guid id, CancellationToken ct) =>
        db.KnowledgeSources.FirstOrDefaultAsync(s => s.Id == id, ct);

    public async Task AddAsync(KnowledgeSource source, CancellationToken ct)
    {
        db.KnowledgeSources.Add(source);
        await db.SaveChangesAsync(ct);
    }

    public async Task UpdateAsync(KnowledgeSource source, CancellationToken ct)
    {
        db.KnowledgeSources.Update(source);
        await db.SaveChangesAsync(ct);
    }

    public async Task<bool> DeleteAsync(Guid id, CancellationToken ct)
    {
        var sourceExists = await db.KnowledgeSources.AnyAsync(s => s.Id == id, ct);
        if (!sourceExists)
        {
            return false;
        }

        await using var transaction = await db.Database.BeginTransactionAsync(ct);

        var documentIds = await db
            .Documents.Where(d => d.SourceId == id)
            .Select(d => d.Id)
            .ToListAsync(ct);

        if (documentIds.Count > 0)
        {
            var affectedTagIds = await db
                .DocumentTags.Where(dt => documentIds.Contains(dt.DocumentId))
                .Select(dt => dt.TagId)
                .Distinct()
                .ToListAsync(ct);

            await db.DocumentChunks.Where(chunk => documentIds.Contains(chunk.DocumentId)).ExecuteDeleteAsync(ct);
            await db.DocumentTags.Where(link => documentIds.Contains(link.DocumentId)).ExecuteDeleteAsync(ct);
            await db.Documents.Where(document => documentIds.Contains(document.Id)).ExecuteDeleteAsync(ct);

            if (affectedTagIds.Count > 0)
            {
                await db
                    .Tags.Where(tag =>
                        affectedTagIds.Contains(tag.Id)
                        && !db.DocumentTags.Any(link => link.TagId == tag.Id)
                    )
                    .ExecuteDeleteAsync(ct);
            }
        }

        await db.KnowledgeSources.Where(source => source.Id == id).ExecuteDeleteAsync(ct);
        await transaction.CommitAsync(ct);
        return true;
    }
}
