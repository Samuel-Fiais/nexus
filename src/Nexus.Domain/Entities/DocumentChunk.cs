namespace Nexus.Domain.Entities;

public class DocumentChunk
{
    public Guid Id { get; set; }
    public Guid DocumentId { get; set; }
    public int ChunkIndex { get; set; }
    public string Content { get; set; } = string.Empty;
    public string? MetadataJson { get; set; }

    /// <summary>
    /// Embedding serializado como bytes (ex: float[] copiado via Buffer.BlockCopy).
    /// </summary>
    public byte[]? Embedding { get; set; }

    public DateTimeOffset CreatedAt { get; set; }
}
