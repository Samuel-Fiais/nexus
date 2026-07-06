using Nexus.Domain.Entities;

namespace Nexus.Application.Abstractions.Persistence;

public interface IInteractionRepository
{
    Task<Interaction?> GetBySlackEventIdAsync(string slackEventId, CancellationToken ct);

    Task<IReadOnlyList<Interaction>> GetByConversationSessionWindowAsync(
        Guid conversationSessionId,
        int sessionWindowNumber,
        CancellationToken ct
    );

    Task AddAsync(Interaction interaction, CancellationToken ct);
}
