namespace Nexus.Domain.Entities;

public class DocumentTag
{
    public Guid DocumentId { get; set; }
    public Guid TagId { get; set; }
    public double? Confidence { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
