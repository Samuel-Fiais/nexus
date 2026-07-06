namespace Nexus.Application.Ingestion;

/// <summary>
/// Chunking por tamanho fixo com overlap (regra 6.5). Extraido do SyncWorker para ser
/// testavel em unidade e reutilizavel pela ingestao.
/// </summary>
public static class ContentChunker
{
    public const int DefaultChunkSize = 1500;
    public const int DefaultChunkOverlap = 200;

    public static IEnumerable<string> Chunk(
        string content,
        int chunkSize = DefaultChunkSize,
        int overlap = DefaultChunkOverlap
    )
    {
        if (string.IsNullOrEmpty(content))
        {
            yield break;
        }

        if (content.Length <= chunkSize)
        {
            yield return content;
            yield break;
        }

        var step = chunkSize - overlap;
        for (var start = 0; start < content.Length; start += step)
        {
            var length = Math.Min(chunkSize, content.Length - start);
            yield return content.Substring(start, length);

            if (start + length >= content.Length)
            {
                yield break;
            }
        }
    }
}
