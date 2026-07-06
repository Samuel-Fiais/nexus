using Microsoft.EntityFrameworkCore;
using Nexus.Application.Abstractions;
using Nexus.Application.Embeddings;
using Nexus.Domain.Enums;

namespace Nexus.Persistence.Search;

/// <summary>
/// Busca vetorial em memoria: carrega os chunks candidatos (somente de documentos indexados e
/// fontes ativas — regras 6.13/9.2) e ranqueia por similaridade de cosseno com o embedding da
/// pergunta. Adequado para SQLite/MVP; na migracao para Postgres deve ser substituido por
/// pgvector (ver docs/postgres-migration.md).
/// </summary>
public class VectorChunkSearchService(NexusDbContext db) : IChunkSearchService
{
    /// <summary>
    /// Score minimo de similaridade para um chunk ser considerado relevante (regra 7.4).
    /// </summary>
    public const double MinScore = 0.05;

    public async Task<IReadOnlyList<ChunkSearchResult>> SearchAsync(
        float[] questionEmbedding,
        int topK,
        IReadOnlyCollection<Guid>? restrictToDocumentIds,
        CancellationToken ct,
        bool enforceMinScore = true
    )
    {
        var query =
            from chunk in db.DocumentChunks
            join document in db.Documents on chunk.DocumentId equals document.Id
            join source in db.KnowledgeSources on document.SourceId equals source.Id
            where document.Status == DocumentStatus.Indexed && source.Active
            select new { Chunk = chunk, document.Title };

        if (restrictToDocumentIds is { Count: > 0 })
        {
            query = query.Where(x => restrictToDocumentIds.Contains(x.Chunk.DocumentId));
        }

        var candidates = await query.ToListAsync(ct);

        return candidates
            .Where(x => x.Chunk.Embedding is { Length: > 0 })
            .Select(x => new ChunkSearchResult(
                x.Chunk,
                x.Title,
                EmbeddingVector.CosineSimilarity(
                    questionEmbedding,
                    EmbeddingVector.ToFloats(x.Chunk.Embedding!)
                )
            ))
            .Where(r => !enforceMinScore || r.Score >= MinScore)
            .OrderByDescending(r => r.Score)
            .Take(topK)
            .ToList();
    }
}
