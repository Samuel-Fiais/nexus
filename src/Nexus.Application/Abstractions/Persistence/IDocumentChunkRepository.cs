using Nexus.Domain.Entities;

namespace Nexus.Application.Abstractions.Persistence;

public interface IDocumentChunkRepository
{
    Task<IReadOnlyList<DocumentChunk>> GetAllAsync(CancellationToken ct);

    Task<bool> HasChunksWithoutEmbeddingAsync(Guid documentId, CancellationToken ct);

    Task ReplaceChunksAsync(
        Guid documentId,
        IReadOnlyList<DocumentChunk> chunks,
        CancellationToken ct
    );
}
