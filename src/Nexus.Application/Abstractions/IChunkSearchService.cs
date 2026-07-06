using Nexus.Domain.Entities;

namespace Nexus.Application.Abstractions;

/// <summary>
/// Resultado da busca de chunks: o chunk em si, o titulo do documento de origem (para citacao
/// de fontes) e o score de similaridade (cosseno) com a pergunta.
/// </summary>
public record ChunkSearchResult(DocumentChunk Chunk, string DocumentTitle, double Score);

/// <summary>
/// Busca de chunks relevantes para uma pergunta, por similaridade vetorial (cosseno) sobre os
/// embeddings persistidos. Somente chunks de documentos indexados e de fontes ativas sao
/// considerados. Quando restrictToDocumentIds e informado (pre-filtro por tags, Epico 7),
/// a busca fica restrita a esses documentos.
/// </summary>
public interface IChunkSearchService
{
    /// <summary>
    /// enforceMinScore controla se o score minimo de relevancia (regra 7.4) e aplicado. Deve
    /// ficar true para busca vetorial geral/por tags, e pode ser false quando restrictToDocumentIds
    /// ja veio de um match forte e independente (ex: titulo do documento bate com a pergunta) —
    /// nesse caso o documento ja foi validado como relevante e o embedding simples (feature
    /// hashing) pode subestimar a similaridade real do texto.
    /// </summary>
    Task<IReadOnlyList<ChunkSearchResult>> SearchAsync(
        float[] questionEmbedding,
        int topK,
        IReadOnlyCollection<Guid>? restrictToDocumentIds,
        CancellationToken ct,
        bool enforceMinScore = true
    );
}
