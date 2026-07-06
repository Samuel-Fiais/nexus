using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Nexus.Application.Abstractions;
using Nexus.Application.Embeddings;
using Nexus.Application.Ingestion;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.KnowledgeSources.Abstractions;
using Nexus.KnowledgeSources.FileExtractors;
using Nexus.KnowledgeSources.LocalFolder;
using Nexus.Persistence;
using Nexus.Persistence.Repositories;

namespace Nexus.Tests.Ingestion;

/// <summary>
/// Teste de integracao da ingestao (task 11.2): pasta local real + provider LocalFolder +
/// repositorios EF sobre SQLite in-memory + embeddings reais; somente o LLM de tags e fake.
/// </summary>
public class DocumentIngestionIntegrationTests : IDisposable
{
    private readonly SqliteConnection _connection;
    private readonly NexusDbContext _db;
    private readonly string _folder;

    private class FakeClock : IClock
    {
        public DateTimeOffset UtcNow => new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

        public DateOnly TodayInTimezone(string timezoneId) => new(2026, 7, 4);
    }

    private class FakeTagGenerationService(IReadOnlyList<string> tags) : ITagGenerationService
    {
        public int Calls { get; private set; }

        public Task<IReadOnlyList<string>> GenerateTagsAsync(
            string title,
            string content,
            CancellationToken ct
        )
        {
            Calls++;
            return Task.FromResult(tags);
        }
    }

    private class FakeWebContentExtractor : IWebContentExtractor
    {
        public Task<string> ExtractAsync(string url, CancellationToken ct) =>
            Task.FromResult($"conteudo extraido de {url}");
    }

    public DocumentIngestionIntegrationTests()
    {
        _connection = new SqliteConnection("DataSource=:memory:");
        _connection.Open();
        var options = new DbContextOptionsBuilder<NexusDbContext>()
            .UseSqlite(_connection)
            .Options;
        _db = new NexusDbContext(options);
        _db.Database.EnsureCreated();

        _folder = Path.Combine(Path.GetTempPath(), $"nexus-ingest-tests-{Guid.NewGuid():N}");
        Directory.CreateDirectory(_folder);
    }

    public void Dispose()
    {
        _db.Dispose();
        _connection.Dispose();
        Directory.Delete(_folder, recursive: true);
    }

    private static LocalFolderKnowledgeSourceProvider CreateProvider() =>
        new(
            new FakeWebContentExtractor(),
            new FileContentExtractorFactory(
                [new MarkdownFileContentExtractor(), new PdfFileContentExtractor()]
            )
        );

    private DocumentIngestionService CreateService(FakeTagGenerationService tagService) =>
        new(
            new DocumentRepository(_db),
            new DocumentChunkRepository(_db),
            new TagRepository(_db),
            new HashingEmbeddingProvider(),
            tagService,
            new FakeClock(),
            NullLogger<DocumentIngestionService>.Instance
        );

    private KnowledgeSource CreateSource()
    {
        var now = DateTimeOffset.UtcNow;
        var source = new KnowledgeSource
        {
            Id = Guid.NewGuid(),
            Name = "Pasta de teste",
            Type = KnowledgeSourceType.LocalFolder,
            UrlOrPath = _folder,
            Active = true,
            CreatedAt = now,
            UpdatedAt = now,
        };
        _db.KnowledgeSources.Add(source);
        _db.SaveChanges();
        return source;
    }

    [Fact]
    public async Task Ingests_Markdown_File_End_To_End()
    {
        await File.WriteAllTextAsync(
            Path.Combine(_folder, "ferias.md"),
            "# Politica de Ferias\n\nTodo colaborador tem direito a 30 dias de ferias por ano."
        );

        var source = CreateSource();
        var provider = CreateProvider();
        var tagService = new FakeTagGenerationService(["férias", "rh"]);
        var ingestion = CreateService(tagService);

        var items = await provider.ListItemsAsync(source, CancellationToken.None);
        Assert.Single(items);
        Assert.Equal(DocumentContentType.Markdown, items[0].ContentType);

        var content = await provider.ReadContentAsync(source, items[0], CancellationToken.None);
        var indexed = await ingestion.IngestAsync(
            source.Id,
            items[0].ExternalId,
            items[0].Title,
            items[0].ContentType,
            content,
            CancellationToken.None
        );

        Assert.True(indexed);

        var document = Assert.Single(_db.Documents.ToList());
        Assert.Equal(DocumentStatus.Indexed, document.Status);
        Assert.Equal(ContentHasher.Sha256(content), document.ContentHash);

        var chunks = _db.DocumentChunks.Where(c => c.DocumentId == document.Id).ToList();
        Assert.NotEmpty(chunks);
        Assert.All(chunks, c => Assert.NotNull(c.Embedding));

        var tagSlugs = (
            from documentTag in _db.DocumentTags
            join tag in _db.Tags on documentTag.TagId equals tag.Id
            where documentTag.DocumentId == document.Id
            select tag.Slug
        ).ToList();
        Assert.Equal(["ferias", "rh"], tagSlugs.OrderBy(s => s).ToList());
    }

    [Fact]
    public async Task Unchanged_Content_Is_Skipped_On_Second_Run()
    {
        await File.WriteAllTextAsync(Path.Combine(_folder, "doc.md"), "conteudo estavel");

        var source = CreateSource();
        var provider = CreateProvider();
        var tagService = new FakeTagGenerationService(["geral"]);
        var ingestion = CreateService(tagService);

        var item = (await provider.ListItemsAsync(source, CancellationToken.None)).Single();
        var content = await provider.ReadContentAsync(source, item, CancellationToken.None);

        var first = await ingestion.IngestAsync(
            source.Id,
            item.ExternalId,
            item.Title,
            item.ContentType,
            content,
            CancellationToken.None
        );
        var second = await ingestion.IngestAsync(
            source.Id,
            item.ExternalId,
            item.Title,
            item.ContentType,
            content,
            CancellationToken.None
        );

        Assert.True(first);
        Assert.False(second);
        Assert.Equal(1, tagService.Calls);
    }

    [Fact]
    public async Task Changed_Content_Is_Reindexed_And_Tags_Regenerated()
    {
        var source = CreateSource();
        var tagService = new FakeTagGenerationService(["geral"]);
        var ingestion = CreateService(tagService);

        await ingestion.IngestAsync(
            source.Id,
            "doc.md",
            "doc",
            DocumentContentType.Markdown,
            "versao 1",
            CancellationToken.None
        );
        var reindexed = await ingestion.IngestAsync(
            source.Id,
            "doc.md",
            "doc",
            DocumentContentType.Markdown,
            "versao 2 com conteudo novo",
            CancellationToken.None
        );

        Assert.True(reindexed);
        Assert.Equal(2, tagService.Calls);

        var document = Assert.Single(_db.Documents.ToList());
        Assert.Equal(ContentHasher.Sha256("versao 2 com conteudo novo"), document.ContentHash);

        var chunk = Assert.Single(
            _db.DocumentChunks.Where(c => c.DocumentId == document.Id).ToList()
        );
        Assert.Equal("versao 2 com conteudo novo", chunk.Content);
    }

    [Fact]
    public async Task Link_Files_Are_Listed_As_WebsiteLink_And_Read_Via_Extractor()
    {
        await File.WriteAllTextAsync(
            Path.Combine(_folder, "portal.link"),
            "https://exemplo.interno/portal\n"
        );

        var source = CreateSource();
        var provider = CreateProvider();

        var item = (await provider.ListItemsAsync(source, CancellationToken.None)).Single();
        Assert.Equal(DocumentContentType.WebsiteLink, item.ContentType);

        var content = await provider.ReadContentAsync(source, item, CancellationToken.None);
        Assert.Equal("conteudo extraido de https://exemplo.interno/portal", content);
    }
}
