namespace Nexus.Application.Abstractions;

/// <summary>
/// Gera tags livres para um documento durante a ingestao (regra 6.9), tipicamente via LLM.
/// Em caso de falha deve retornar lista vazia (a ingestao nao pode falhar por causa de tags).
/// </summary>
public interface ITagGenerationService
{
    Task<IReadOnlyList<string>> GenerateTagsAsync(
        string title,
        string content,
        CancellationToken ct
    );
}
