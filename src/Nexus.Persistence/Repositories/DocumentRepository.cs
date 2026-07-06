using Microsoft.EntityFrameworkCore;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Application.Embeddings;
using Nexus.Domain.Entities;

namespace Nexus.Persistence.Repositories;

public class DocumentRepository(NexusDbContext db) : IDocumentRepository
{
    public Task<Document?> GetByIdAsync(Guid id, CancellationToken ct) =>
        db.Documents.FirstOrDefaultAsync(d => d.Id == id, ct);

    public Task<Document?> GetBySourceAndExternalIdAsync(
        Guid sourceId,
        string externalId,
        CancellationToken ct
    ) =>
        db.Documents.FirstOrDefaultAsync(
            d => d.SourceId == sourceId && d.ExternalId == externalId,
            ct
        );

    public async Task<IReadOnlyList<Document>> GetByTitlesAsync(
        IReadOnlyCollection<string> titles,
        CancellationToken ct
    )
    {
        var documents = await db
            .Documents.Where(d => titles.Contains(d.Title) && d.Status == Domain.Enums.DocumentStatus.Indexed)
            .ToListAsync(ct);

        return documents.OrderByDescending(d => d.UpdatedAt).ToList();
    }

    public async Task<IReadOnlyList<Document>> SearchByTitleTermsAsync(
        IReadOnlyCollection<string> terms,
        CancellationToken ct
    )
    {
        if (terms.Count == 0)
        {
            return [];
        }

        var normalizedTerms = terms
            .Select(Normalize)
            .Where(term => !string.IsNullOrWhiteSpace(term))
            .Distinct()
            .ToList();
        if (normalizedTerms.Count == 0)
        {
            return [];
        }

        var candidates = await db
            .Documents.Where(d => d.Status == Domain.Enums.DocumentStatus.Indexed)
            .ToListAsync(ct);

        return candidates
            .Where(document =>
            {
                var normalizedTitle = Normalize(document.Title);
                return normalizedTerms.Any(term =>
                    normalizedTitle.Contains(term)
                    || normalizedTitle.Contains(Singularize(term))
                    || normalizedTitle.Contains(Stem(term))
                );
            })
            .OrderByDescending(document => document.UpdatedAt)
            .ToList();
    }

    /// <summary>
    /// Singularizacao simples (sufixo "s") para que termos no plural extraidos da pergunta
    /// (ex: "apps", "mobiles") tambem encontrem titulos no singular (ex: "app-festpay-school").
    /// </summary>
    private static string Singularize(string term) =>
        term.Length > 3 && term.EndsWith('s') ? term[..^1] : term;

    /// <summary>
    /// Radical simples (prefixo) para tolerar variacoes de conjugacao/genero em portugues
    /// (ex: "limitar" (verbo) deve encontrar titulos com "limite" (substantivo)).
    /// </summary>
    private const int StemLength = 5;

    private static string Stem(string term) => term.Length > StemLength ? term[..StemLength] : term;

    public async Task AddAsync(Document document, CancellationToken ct)
    {
        db.Documents.Add(document);
        await db.SaveChangesAsync(ct);
    }

    public async Task UpdateAsync(Document document, CancellationToken ct)
    {
        db.Documents.Update(document);
        await db.SaveChangesAsync(ct);
    }

    private static string Normalize(string value)
    {
        var chars = HashingEmbeddingProvider
            .RemoveDiacritics(value.ToLowerInvariant())
            .Where(char.IsLetterOrDigit)
            .ToArray();
        return new string(chars);
    }
}
