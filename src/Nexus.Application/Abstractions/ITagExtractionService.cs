namespace Nexus.Application.Abstractions;

/// <summary>
/// Extrai da pergunta do usuario as tags conhecidas que ela menciona (regra 7.1), usadas como
/// pre-filtro da busca vetorial. Implementacao atual: matching deterministico dos tokens da
/// pergunta contra as tags existentes na base (sem custo/latencia extra de LLM por pergunta —
/// um LLM leve pode substituir esta implementacao atras da mesma interface).
/// </summary>
public interface ITagExtractionService
{
    /// <summary>
    /// Retorna os slugs das tags conhecidas mencionadas na pergunta (vazio se nenhuma).
    /// </summary>
    Task<IReadOnlyList<string>> ExtractMatchingTagSlugsAsync(
        string question,
        CancellationToken ct
    );
}
