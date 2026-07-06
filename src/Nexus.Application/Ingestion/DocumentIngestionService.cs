using Microsoft.Extensions.Logging;
using Nexus.Application.Abstractions;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Application.Embeddings;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;

namespace Nexus.Application.Ingestion;

public class DocumentIngestionService(
    IDocumentRepository documentRepository,
    IDocumentChunkRepository chunkRepository,
    ITagRepository tagRepository,
    IEmbeddingProvider embeddingProvider,
    ITagGenerationService tagGenerationService,
    IClock clock,
    ILogger<DocumentIngestionService> logger
) : IDocumentIngestionService
{
    public async Task<bool> IngestAsync(
        Guid sourceId,
        string externalId,
        string title,
        DocumentContentType contentType,
        string content,
        CancellationToken ct
    )
    {
        var contentHash = ContentHasher.Sha256(content);
        var existingDocument = await documentRepository.GetBySourceAndExternalIdAsync(
            sourceId,
            externalId,
            ct
        );

        if (existingDocument is not null && existingDocument.ContentHash == contentHash)
        {
            // Conteudo inalterado. Reindexa mesmo assim se houver chunks sem embedding
            // (documentos indexados antes da introducao de embeddings reais).
            var missingEmbeddings = await chunkRepository.HasChunksWithoutEmbeddingAsync(
                existingDocument.Id,
                ct
            );
            if (!missingEmbeddings)
            {
                return false;
            }
        }

        var now = clock.UtcNow;
        Document document;

        if (existingDocument is null)
        {
            document = new Document
            {
                Id = Guid.NewGuid(),
                SourceId = sourceId,
                Title = title,
                ExternalId = externalId,
                ContentType = contentType,
                ContentHash = contentHash,
                Status = DocumentStatus.Pending,
                CreatedAt = now,
                UpdatedAt = now,
            };
            await documentRepository.AddAsync(document, ct);
        }
        else
        {
            document = existingDocument;
            document.ContentHash = contentHash;
            document.Title = title;
            document.Status = DocumentStatus.Pending;
            document.UpdatedAt = now;
            await documentRepository.UpdateAsync(document, ct);
        }

        var chunks = new List<DocumentChunk>();
        foreach (var (text, index) in ContentChunker.Chunk(content).Select((t, i) => (t, i)))
        {
            var embedding = await embeddingProvider.GenerateEmbeddingAsync(text, ct);
            chunks.Add(
                new DocumentChunk
                {
                    Id = Guid.NewGuid(),
                    DocumentId = document.Id,
                    ChunkIndex = index,
                    Content = text,
                    Embedding = embedding.Length > 0 ? EmbeddingVector.ToBytes(embedding) : null,
                    CreatedAt = now,
                }
            );
        }

        await chunkRepository.ReplaceChunksAsync(document.Id, chunks, ct);

        // Auto-tagging (regras 6.9-6.11): tags sao regeneradas a cada reindexacao. Se a geracao
        // falhar (lista vazia), as tags existentes sao preservadas para nao degradar a busca.
        var tags = await tagGenerationService.GenerateTagsAsync(title, content, ct);
        if (tags.Count > 0)
        {
            await tagRepository.ReplaceDocumentTagsAsync(document.Id, tags, ct);
        }

        document.Status = DocumentStatus.Indexed;
        document.UpdatedAt = clock.UtcNow;
        await documentRepository.UpdateAsync(document, ct);

        logger.LogInformation(
            "Documento '{Title}' ({ExternalId}) indexado com {ChunkCount} chunk(s) e {TagCount} tag(s).",
            document.Title,
            externalId,
            chunks.Count,
            tags.Count
        );

        return true;
    }
}
