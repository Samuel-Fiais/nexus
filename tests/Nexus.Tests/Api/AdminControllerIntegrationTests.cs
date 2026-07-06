using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Persistence;

namespace Nexus.Tests.Api;

public class AdminControllerIntegrationTests : IDisposable
{
    private const string AdminApiKey = "test-admin-key";

    private readonly string _dbPath;
    private readonly string _knowledgePath;
    private readonly WebApplicationFactory<Program> _factory;

    public AdminControllerIntegrationTests()
    {
        var runId = Guid.NewGuid().ToString("N");
        _dbPath = Path.Combine(Path.GetTempPath(), $"nexus-admin-tests-{runId}.db");
        _knowledgePath = Path.Combine(Path.GetTempPath(), $"nexus-admin-tests-{runId}-knowledge");

        _factory = new WebApplicationFactory<Program>().WithWebHostBuilder(builder =>
        {
            builder.UseSetting("ConnectionStrings:Default", $"Data Source={_dbPath}");
            builder.UseSetting("Knowledge:LocalFolderPath", _knowledgePath);
            builder.UseSetting("Admin:ApiKey", AdminApiKey);
        });
    }

    public void Dispose()
    {
        _factory.Dispose();
        foreach (var suffix in new[] { "", "-shm", "-wal" })
        {
            var path = _dbPath + suffix;
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }

        if (Directory.Exists(_knowledgePath))
        {
            Directory.Delete(_knowledgePath, recursive: true);
        }
    }

    [Fact]
    public async Task Delete_KnowledgeSource_Removes_Source_And_Indexed_Data()
    {
        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<NexusDbContext>();

        var sourceId = Guid.NewGuid();
        var documentId = Guid.NewGuid();
        var tagId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        db.KnowledgeSources.Add(
            new KnowledgeSource
            {
                Id = sourceId,
                Name = "Base temporaria",
                Type = KnowledgeSourceType.LocalFolder,
                UrlOrPath = "/tmp/base-temporaria",
                Active = true,
                CreatedAt = now,
                UpdatedAt = now,
            }
        );
        db.Documents.Add(
            new Document
            {
                Id = documentId,
                SourceId = sourceId,
                Title = "Documento da base",
                ExternalId = "doc-1",
                ContentType = DocumentContentType.Markdown,
                ContentHash = "hash",
                Status = DocumentStatus.Indexed,
                CreatedAt = now,
                UpdatedAt = now,
            }
        );
        db.DocumentChunks.Add(
            new DocumentChunk
            {
                Id = Guid.NewGuid(),
                DocumentId = documentId,
                ChunkIndex = 0,
                Content = "conteudo",
                CreatedAt = now,
            }
        );
        db.Tags.Add(
            new Tag
            {
                Id = tagId,
                Name = "Financeiro",
                Slug = "financeiro",
                CreatedAt = now,
            }
        );
        db.DocumentTags.Add(
            new DocumentTag
            {
                DocumentId = documentId,
                TagId = tagId,
                Confidence = 0.9,
                CreatedAt = now,
            }
        );
        await db.SaveChangesAsync();

        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Admin-Api-Key", AdminApiKey);

        var response = await client.DeleteAsync($"/admin/knowledge-sources/{sourceId}");

        Assert.Equal(HttpStatusCode.NoContent, response.StatusCode);
        Assert.False(await db.KnowledgeSources.AnyAsync(source => source.Id == sourceId));
        Assert.False(await db.Documents.AnyAsync(document => document.SourceId == sourceId));
        Assert.False(await db.DocumentChunks.AnyAsync(chunk => chunk.DocumentId == documentId));
        Assert.False(await db.DocumentTags.AnyAsync(link => link.DocumentId == documentId));
        Assert.False(await db.Tags.AnyAsync(tag => tag.Id == tagId));
    }

    [Fact]
    public async Task Delete_KnowledgeSource_Returns_NotFound_When_Id_Does_Not_Exist()
    {
        var client = _factory.CreateClient();
        client.DefaultRequestHeaders.Add("X-Admin-Api-Key", AdminApiKey);

        var response = await client.DeleteAsync($"/admin/knowledge-sources/{Guid.NewGuid()}");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
