using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Nexus.Application.Embeddings;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Persistence;
using Nexus.Persistence.Search;

namespace Nexus.Tests.Persistence;

public class VectorChunkSearchServiceTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly NexusDbContext _db;

    public VectorChunkSearchServiceTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();
        var options = new DbContextOptionsBuilder<NexusDbContext>()
            .UseSqlite(_connection)
            .Options;
        _db = new NexusDbContext(options);
        _db.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
    }

    private (KnowledgeSource Source, Document Document) SeedDocument(
        string title,
        string chunkText,
        bool sourceActive = true,
        DocumentStatus status = DocumentStatus.Indexed
    )
    {
        var now = DateTimeOffset.UtcNow;
        var source = new KnowledgeSource
        {
            Id = Guid.NewGuid(),
            Name = $"Fonte {title}",
            Type = KnowledgeSourceType.LocalFolder,
            UrlOrPath = "/tmp",
            Active = sourceActive,
            CreatedAt = now,
            UpdatedAt = now,
        };
        var document = new Document
        {
            Id = Guid.NewGuid(),
            SourceId = source.Id,
            Title = title,
            ExternalId = $"{title}.md",
            ContentType = DocumentContentType.Markdown,
            ContentHash = "hash",
            Status = status,
            CreatedAt = now,
            UpdatedAt = now,
        };
        var chunk = new DocumentChunk
        {
            Id = Guid.NewGuid(),
            DocumentId = document.Id,
            ChunkIndex = 0,
            Content = chunkText,
            Embedding = EmbeddingVector.ToBytes(
                HashingEmbeddingProvider.GenerateEmbedding(chunkText)
            ),
            CreatedAt = now,
        };

        _db.KnowledgeSources.Add(source);
        _db.Documents.Add(document);
        _db.DocumentChunks.Add(chunk);
        _db.SaveChanges();

        return (source, document);
    }

    [Fact]
    public async Task Ranks_Relevant_Chunk_First()
    {
        SeedDocument("Politica de Ferias", "a politica de ferias permite 30 dias por ano");
        SeedDocument("Guia de Impressoras", "como configurar impressoras na rede do escritorio");

        var service = new VectorChunkSearchService(_db);
        var question = HashingEmbeddingProvider.GenerateEmbedding(
            "quantos dias de ferias eu tenho por ano?"
        );

        var results = await service.SearchAsync(question, 5, null, CancellationToken.None);

        Assert.NotEmpty(results);
        Assert.Equal("Politica de Ferias", results[0].DocumentTitle);
        Assert.True(results[0].Score > 0);
    }

    [Fact]
    public async Task Excludes_Chunks_From_Inactive_Sources()
    {
        SeedDocument(
            "Documento Inativo",
            "a politica de ferias permite 30 dias por ano",
            sourceActive: false
        );

        var service = new VectorChunkSearchService(_db);
        var question = HashingEmbeddingProvider.GenerateEmbedding("politica de ferias");

        var results = await service.SearchAsync(question, 5, null, CancellationToken.None);

        Assert.Empty(results);
    }

    [Fact]
    public async Task Excludes_Documents_Not_Indexed()
    {
        SeedDocument(
            "Documento Pendente",
            "a politica de ferias permite 30 dias por ano",
            status: DocumentStatus.Pending
        );

        var service = new VectorChunkSearchService(_db);
        var question = HashingEmbeddingProvider.GenerateEmbedding("politica de ferias");

        var results = await service.SearchAsync(question, 5, null, CancellationToken.None);

        Assert.Empty(results);
    }

    [Fact]
    public async Task Restricts_Search_To_Given_Document_Ids()
    {
        var (_, docA) = SeedDocument(
            "Politica de Ferias",
            "a politica de ferias permite 30 dias por ano"
        );
        SeedDocument("Ferias Coletivas", "ferias coletivas acontecem em dezembro");

        var service = new VectorChunkSearchService(_db);
        var question = HashingEmbeddingProvider.GenerateEmbedding("ferias");

        var results = await service.SearchAsync(
            question,
            5,
            [docA.Id],
            CancellationToken.None
        );

        Assert.All(results, r => Assert.Equal(docA.Id, r.Chunk.DocumentId));
    }
}
