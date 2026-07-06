using Nexus.Domain.Enums;

namespace Nexus.Domain.Entities;

public class Document
{
    public Guid Id { get; set; }
    public Guid SourceId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string ExternalId { get; set; } = string.Empty;
    public DocumentContentType ContentType { get; set; }
    public string ContentHash { get; set; } = string.Empty;
    public DocumentStatus Status { get; set; } = DocumentStatus.Pending;
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
