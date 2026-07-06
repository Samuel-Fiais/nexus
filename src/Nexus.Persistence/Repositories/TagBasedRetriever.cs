using Microsoft.EntityFrameworkCore;
using Nexus.Application.Abstractions;
using Nexus.Domain.Enums;

namespace Nexus.Persistence.Repositories;

/// <summary>
/// Regra 7.2: resolve documentos por tags, considerando apenas documentos indexados de
/// fontes ativas.
/// </summary>
public class TagBasedRetriever(NexusDbContext db) : ITagBasedRetriever
{
    public async Task<IReadOnlyList<Guid>> GetDocumentIdsByTagSlugsAsync(
        IReadOnlyCollection<string> tagSlugs,
        CancellationToken ct
    )
    {
        if (tagSlugs.Count == 0)
        {
            return [];
        }

        var query =
            from documentTag in db.DocumentTags
            join tag in db.Tags on documentTag.TagId equals tag.Id
            join document in db.Documents on documentTag.DocumentId equals document.Id
            join source in db.KnowledgeSources on document.SourceId equals source.Id
            where
                tagSlugs.Contains(tag.Slug)
                && document.Status == DocumentStatus.Indexed
                && source.Active
            select document.Id;

        return await query.Distinct().ToListAsync(ct);
    }
}
