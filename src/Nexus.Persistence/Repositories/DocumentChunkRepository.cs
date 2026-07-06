using Microsoft.EntityFrameworkCore;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Domain.Entities;

namespace Nexus.Persistence.Repositories;

public class DocumentChunkRepository(NexusDbContext db) : IDocumentChunkRepository
{
    public async Task<IReadOnlyList<DocumentChunk>> GetAllAsync(CancellationToken ct) =>
        await db.DocumentChunks.ToListAsync(ct);

    public Task<bool> HasChunksWithoutEmbeddingAsync(Guid documentId, CancellationToken ct) =>
        db.DocumentChunks.AnyAsync(c => c.DocumentId == documentId && c.Embedding == null, ct);

    public async Task ReplaceChunksAsync(
        Guid documentId,
        IReadOnlyList<DocumentChunk> chunks,
        CancellationToken ct
    )
    {
        var existing = db.DocumentChunks.Where(c => c.DocumentId == documentId);
        db.DocumentChunks.RemoveRange(existing);
        await db.DocumentChunks.AddRangeAsync(chunks, ct);
        await db.SaveChangesAsync(ct);
    }
}
