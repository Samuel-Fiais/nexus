using Microsoft.EntityFrameworkCore;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Domain.Entities;

namespace Nexus.Persistence.Repositories;

public class ConversationSessionRepository(NexusDbContext db) : IConversationSessionRepository
{
    public Task<ConversationSession?> GetBySessionKeyAsync(
        string sessionKey,
        CancellationToken ct
    ) => db.ConversationSessions.FirstOrDefaultAsync(s => s.SessionKey == sessionKey, ct);

    public async Task AddAsync(ConversationSession session, CancellationToken ct)
    {
        db.ConversationSessions.Add(session);
        await db.SaveChangesAsync(ct);
    }

    public async Task UpdateAsync(ConversationSession session, CancellationToken ct)
    {
        db.ConversationSessions.Update(session);
        await db.SaveChangesAsync(ct);
    }
}
