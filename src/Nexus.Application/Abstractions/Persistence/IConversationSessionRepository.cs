using Nexus.Domain.Entities;

namespace Nexus.Application.Abstractions.Persistence;

public interface IConversationSessionRepository
{
    Task<ConversationSession?> GetBySessionKeyAsync(string sessionKey, CancellationToken ct);

    Task AddAsync(ConversationSession session, CancellationToken ct);

    Task UpdateAsync(ConversationSession session, CancellationToken ct);
}
