using Microsoft.EntityFrameworkCore;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Application.Tags;
using Nexus.Domain.Entities;

namespace Nexus.Persistence.Repositories;

public class TagRepository(NexusDbContext db) : ITagRepository
{
    public Task<Tag?> GetBySlugAsync(string slug, CancellationToken ct) =>
        db.Tags.FirstOrDefaultAsync(t => t.Slug == slug, ct);

    public async Task<IReadOnlyList<Tag>> GetAllAsync(CancellationToken ct) =>
        await db.Tags.ToListAsync(ct);

    public async Task AddAsync(Tag tag, CancellationToken ct)
    {
        db.Tags.Add(tag);
        await db.SaveChangesAsync(ct);
    }

    public async Task ReplaceDocumentTagsAsync(
        Guid documentId,
        IReadOnlyList<string> tagNames,
        CancellationToken ct
    )
    {
        var now = DateTimeOffset.UtcNow;
        var tagIds = new List<Guid>();

        foreach (var name in tagNames)
        {
            var slug = TagSlug.From(name);
            if (slug.Length == 0)
            {
                continue;
            }

            var tag = await db.Tags.FirstOrDefaultAsync(t => t.Slug == slug, ct);
            if (tag is null)
            {
                tag = new Tag
                {
                    Id = Guid.NewGuid(),
                    Name = name.Trim(),
                    Slug = slug,
                    CreatedAt = now,
                };
                db.Tags.Add(tag);
            }

            if (!tagIds.Contains(tag.Id))
            {
                tagIds.Add(tag.Id);
            }
        }

        var existingLinks = db.DocumentTags.Where(dt => dt.DocumentId == documentId);
        db.DocumentTags.RemoveRange(existingLinks);

        foreach (var tagId in tagIds)
        {
            db.DocumentTags.Add(
                new DocumentTag
                {
                    DocumentId = documentId,
                    TagId = tagId,
                    Confidence = null,
                    CreatedAt = now,
                }
            );
        }

        await db.SaveChangesAsync(ct);
    }
}
