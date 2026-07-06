namespace Nexus.Domain.Entities;

public class ConversationSession
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string SessionKey { get; set; } = string.Empty;
    public string? SlackChannelId { get; set; }
    public string? SlackThreadTs { get; set; }
    public string? Summary { get; set; }
    public int CurrentWindowNumber { get; set; } = 1;
    public int MessageCountInWindow { get; set; }
    public int TotalMessageCount { get; set; }
    public DateTimeOffset? LastCompactedAt { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset UpdatedAt { get; set; }
}
