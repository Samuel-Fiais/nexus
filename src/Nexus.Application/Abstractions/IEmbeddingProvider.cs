namespace Nexus.Application.Abstractions;

/// <summary>
/// Gera o embedding (vetor de floats) de um texto, usado tanto na indexacao dos chunks quanto
/// na busca por similaridade da pergunta. Implementacao atual: HashingEmbeddingProvider
/// (local/deterministico). Para trocar por um provedor semantico externo, ver docs/extension-points.md.
/// </summary>
public interface IEmbeddingProvider
{
    Task<float[]> GenerateEmbeddingAsync(string text, CancellationToken ct);
}
