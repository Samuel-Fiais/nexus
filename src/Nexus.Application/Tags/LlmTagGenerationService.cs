using System.Text.Json;
using Microsoft.Extensions.Logging;
using Nexus.Application.Abstractions;
using Nexus.Llm.Abstractions;

namespace Nexus.Application.Tags;

/// <summary>
/// Auto-tagging via LLM (regra 6.9): pede ao provedor de LLM uma lista curta de tags livres
/// (JSON array) para o documento. Qualquer falha (LLM indisponivel, resposta fora do formato)
/// resulta em lista vazia — a ingestao segue sem tags e o fluxo de busca cai no fallback
/// de busca vetorial completa (regra 7.4).
/// </summary>
public class LlmTagGenerationService(
    ILlmProvider llmProvider,
    ILogger<LlmTagGenerationService> logger
) : ITagGenerationService
{
    private const int MaxTags = 8;
    private const int MaxContentChars = 4000;

    public async Task<IReadOnlyList<string>> GenerateTagsAsync(
        string title,
        string content,
        CancellationToken ct
    )
    {
        try
        {
            var truncated =
                content.Length <= MaxContentChars ? content : content[..MaxContentChars];

            var systemPrompt =
                "Você gera tags de classificação para documentos de uma base de conhecimento "
                + "corporativa da Festpay (fintech brasileira). "
                + "Responda SOMENTE com um array JSON de strings (sem markdown, sem explicação), "
                + $"contendo de 5 a {MaxTags} tags curtas em portugues. "
                + "Inclua tags para: nomes de pessoas mencionadas, cargos, entidades (empresas, "
                + "produtos), temas de negócio, e palavras-chave relevantes. "
                + "Use kebab-case, minusculas, sem acentos. "
                + "Exemplo: [\"marco-epelman\", \"igor-moura\", \"ceo\", \"fintech\", "
                + "\"pagamentos-digitais\", \"cantina-escolar\", \"socios\", \"fundadores\"]";

            var userPrompt = $"Titulo: {title}\n\nConteudo:\n{truncated}";

            var result = await llmProvider.GenerateAnswerAsync(systemPrompt, userPrompt, ct);
            var tags = ParseTags(result.Answer);

            if (tags.Count == 0)
            {
                logger.LogWarning(
                    "Auto-tagging nao retornou tags validas para o documento '{Title}'.",
                    title
                );
            }

            return tags;
        }
        catch (Exception ex)
        {
            logger.LogWarning(
                ex,
                "Falha ao gerar tags via LLM para o documento '{Title}'. Seguindo sem tags.",
                title
            );
            return [];
        }
    }

    private static IReadOnlyList<string> ParseTags(string answer)
    {
        // Tolerante a respostas com texto ao redor: extrai o primeiro array JSON presente.
        var start = answer.IndexOf('[');
        var end = answer.LastIndexOf(']');
        if (start < 0 || end <= start)
        {
            return [];
        }

        using var doc = JsonDocument.Parse(answer[start..(end + 1)]);
        if (doc.RootElement.ValueKind != JsonValueKind.Array)
        {
            return [];
        }

        return doc
            .RootElement.EnumerateArray()
            .Where(e => e.ValueKind == JsonValueKind.String)
            .Select(e => e.GetString()!.Trim())
            .Where(t => t.Length > 0)
            .Select(t => t.ToLowerInvariant())
            .Distinct()
            .Take(MaxTags)
            .ToList();
    }
}
