using Nexus.Domain.Enums;

namespace Nexus.Domain.Entities;

public class KnowledgeSource
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public KnowledgeSourceType Type { get; set; }
    public string UrlOrPath { get; set; } = string.Empty;
    public string? Provider { get; set; }
    public bool Active { get; set; } = true;
    public DateTimeOffset? LastSyncAt { get; set; }
    public string? MetadataJson { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
