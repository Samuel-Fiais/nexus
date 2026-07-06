using Nexus.Domain.Enums;

namespace Nexus.Domain.Entities;

public class Interaction
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public Guid? ConversationSessionId { get; set; }
    public int? SessionWindowNumber { get; set; }
    public string? SlackChannelId { get; set; }
    public string? SlackThreadTs { get; set; }

    /// <summary>
    /// Identificador do evento do Slack, usado para garantir idempotencia.
    /// </summary>
    public string SlackEventId { get; set; } = string.Empty;

    public string Question { get; set; } = string.Empty;
    public string? Answer { get; set; }
    public string? SourcesJson { get; set; }
    public string? TagsMatchedJson { get; set; }
    public string? Model { get; set; }
    public int? TokensUsed { get; set; }
    public int? InputTokens { get; set; }
    public int? OutputTokens { get; set; }
    public int? CachedTokens { get; set; }
    public decimal? EstimatedCostUsd { get; set; }
    public InteractionStatus Status { get; set; }
    public string? ErrorMessage { get; set; }
    public DateTimeOffset CreatedAt { get; set; }
}
