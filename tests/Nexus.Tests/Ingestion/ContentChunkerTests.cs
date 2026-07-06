using Nexus.Application.Ingestion;

namespace Nexus.Tests.Ingestion;

public class ContentChunkerTests
{
    [Fact]
    public void Empty_Content_Yields_No_Chunks()
    {
        Assert.Empty(ContentChunker.Chunk(string.Empty));
    }

    [Fact]
    public void Short_Content_Yields_Single_Chunk()
    {
        var content = new string('a', 100);

        var chunks = ContentChunker.Chunk(content).ToList();

        Assert.Single(chunks);
        Assert.Equal(content, chunks[0]);
    }

    [Fact]
    public void Long_Content_Is_Split_With_Overlap()
    {
        var content = new string('a', 4000);

        var chunks = ContentChunker.Chunk(content).ToList();

        Assert.True(chunks.Count > 1);
        Assert.All(chunks, c => Assert.True(c.Length <= ContentChunker.DefaultChunkSize));

        // O passo entre chunks e ChunkSize - Overlap; portanto o inicio de cada chunk repete
        // os ultimos "overlap" caracteres do anterior.
        var step = ContentChunker.DefaultChunkSize - ContentChunker.DefaultChunkOverlap;
        var expectedCount = 0;
        for (var start = 0; start < content.Length; start += step)
        {
            expectedCount++;
            if (start + ContentChunker.DefaultChunkSize >= content.Length)
            {
                break;
            }
        }

        Assert.Equal(expectedCount, chunks.Count);
    }

    [Fact]
    public void Chunks_Reconstruct_Original_Content()
    {
        var random = new Random(42);
        var content = new string(
            Enumerable.Range(0, 5000).Select(_ => (char)('a' + random.Next(26))).ToArray()
        );

        var chunks = ContentChunker.Chunk(content).ToList();
        var step = ContentChunker.DefaultChunkSize - ContentChunker.DefaultChunkOverlap;

        for (var i = 0; i < chunks.Count; i++)
        {
            var start = i * step;
            Assert.Equal(content.Substring(start, chunks[i].Length), chunks[i]);
        }

        // O ultimo chunk deve alcancar o fim do conteudo.
        var lastStart = (chunks.Count - 1) * step;
        Assert.Equal(content.Length, lastStart + chunks[^1].Length);
    }
}
