using Microsoft.EntityFrameworkCore;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Domain.Entities;

namespace Nexus.Persistence.Repositories;

public class InteractionRepository(NexusDbContext db) : IInteractionRepository
{
    public Task<Interaction?> GetBySlackEventIdAsync(string slackEventId, CancellationToken ct) =>
        db.Interactions.FirstOrDefaultAsync(i => i.SlackEventId == slackEventId, ct);

    public async Task<IReadOnlyList<Interaction>> GetByConversationSessionWindowAsync(
        Guid conversationSessionId,
        int sessionWindowNumber,
        CancellationToken ct
    )
    {
        var items = await db
            .Interactions.Where(i =>
                i.ConversationSessionId == conversationSessionId
                && i.SessionWindowNumber == sessionWindowNumber
            )
            .ToListAsync(ct);

        return items.OrderBy(i => i.CreatedAt).ToList();
    }

    public async Task AddAsync(Interaction interaction, CancellationToken ct)
    {
        db.Interactions.Add(interaction);
        await db.SaveChangesAsync(ct);
    }
}
