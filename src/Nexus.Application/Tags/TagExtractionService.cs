using Nexus.Application.Abstractions;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Application.Embeddings;

namespace Nexus.Application.Tags;

/// <summary>
/// Matching deterministico: uma tag "casa" com a pergunta quando todos os tokens do nome da
/// tag (normalizados, sem acento) aparecem entre os tokens da pergunta. Decisao de
/// custo/beneficio da regra 7.1: evita uma chamada extra de LLM por pergunta (latencia dentro
/// do limite de 3s do Slack e custo zero); um extrator via LLM leve pode ser plugado depois
/// atras de ITagExtractionService.
/// </summary>
public class TagExtractionService(ITagRepository tagRepository) : ITagExtractionService
{
    public async Task<IReadOnlyList<string>> ExtractMatchingTagSlugsAsync(
        string question,
        CancellationToken ct
    )
    {
        var tags = await tagRepository.GetAllAsync(ct);
        if (tags.Count == 0)
        {
            return [];
        }

        var questionTokens = HashingEmbeddingProvider.Tokenize(question).ToHashSet();
        if (questionTokens.Count == 0)
        {
            return [];
        }

        return tags.Where(tag =>
            {
                var tagTokens = HashingEmbeddingProvider.Tokenize(tag.Name.Replace('-', ' '))
                    .ToList();
                return tagTokens.Count > 0 && tagTokens.Any(questionTokens.Contains);
            })
            .Select(tag => tag.Slug)
            .Distinct()
            .ToList();
    }
}
