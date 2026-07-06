using Microsoft.EntityFrameworkCore;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Domain.Entities;

namespace Nexus.Persistence.Repositories;

public class UserUsageRepository(NexusDbContext db) : IUserUsageRepository
{
    public Task<UserDailyUsage?> GetAsync(Guid userId, DateOnly date, CancellationToken ct) =>
        db.UserDailyUsages.FirstOrDefaultAsync(u => u.UserId == userId && u.Date == date, ct);

    public async Task UpsertAsync(UserDailyUsage usage, CancellationToken ct)
    {
        var existing = await db.UserDailyUsages.FirstOrDefaultAsync(
            u => u.UserId == usage.UserId && u.Date == usage.Date,
            ct
        );

        if (existing is null)
        {
            db.UserDailyUsages.Add(usage);
        }
        else
        {
            existing.RequestCount = usage.RequestCount;
            existing.TokenCount = usage.TokenCount;
            existing.UpdatedAt = usage.UpdatedAt;
        }

        await db.SaveChangesAsync(ct);
    }

    public Task<int> DeleteOlderThanAsync(DateOnly cutoffDate, CancellationToken ct) =>
        db.UserDailyUsages.Where(u => u.Date < cutoffDate).ExecuteDeleteAsync(ct);
}
