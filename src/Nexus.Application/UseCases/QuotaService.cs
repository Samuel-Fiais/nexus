using Microsoft.Extensions.Options;
using Nexus.Application.Abstractions;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Domain.Entities;

namespace Nexus.Application.UseCases;

public class QuotaService(
    IUserUsageRepository usageRepository,
    IClock clock,
    IOptions<AppOptions> appOptions
) : IQuotaService
{
    private readonly string _timezoneId = appOptions.Value.Timezone;

    public async Task<bool> HasQuotaAvailableAsync(Guid userId, CancellationToken ct)
    {
        var remaining = await GetRemainingQuotaAsync(userId, ct);
        return remaining > 0;
    }

    public async Task<int> GetRemainingQuotaAsync(Guid userId, CancellationToken ct)
    {
        var today = clock.TodayInTimezone(_timezoneId);
        var usage = await usageRepository.GetAsync(userId, today, ct);
        var used = usage?.RequestCount ?? 0;
        return Math.Max(0, IQuotaService.DailyLimit - used);
    }

    public async Task ConsumeQuotaAsync(Guid userId, int tokensUsed, CancellationToken ct)
    {
        var today = clock.TodayInTimezone(_timezoneId);
        var usage = await usageRepository.GetAsync(userId, today, ct);

        usage ??= new UserDailyUsage
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Date = today,
            RequestCount = 0,
            TokenCount = 0,
            CreatedAt = clock.UtcNow,
            UpdatedAt = clock.UtcNow,
        };

        usage.RequestCount += 1;
        usage.TokenCount += tokensUsed;
        usage.UpdatedAt = clock.UtcNow;

        await usageRepository.UpsertAsync(usage, ct);
    }
}
