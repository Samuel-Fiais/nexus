using Microsoft.Extensions.Options;
using Nexus.Application;
using Nexus.Application.Abstractions;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Application.UseCases;
using Nexus.Domain.Entities;

namespace Nexus.Tests.Application;

public class QuotaServiceTests
{
    private class FakeClock : IClock
    {
        public DateTimeOffset UtcNow { get; set; } = new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

        public DateOnly TodayInTimezone(string timezoneId) => DateOnly.FromDateTime(UtcNow.Date);
    }

    private class FakeUserUsageRepository : IUserUsageRepository
    {
        private readonly Dictionary<(Guid, DateOnly), UserDailyUsage> _store = new();

        public Task<UserDailyUsage?> GetAsync(Guid userId, DateOnly date, CancellationToken ct)
        {
            _store.TryGetValue((userId, date), out var usage);
            return Task.FromResult(usage);
        }

        public Task UpsertAsync(UserDailyUsage usage, CancellationToken ct)
        {
            _store[(usage.UserId, usage.Date)] = usage;
            return Task.CompletedTask;
        }

        public Task<int> DeleteOlderThanAsync(DateOnly cutoffDate, CancellationToken ct)
        {
            var keys = _store.Keys.Where(k => k.Item2 < cutoffDate).ToList();
            foreach (var key in keys)
            {
                _store.Remove(key);
            }

            return Task.FromResult(keys.Count);
        }
    }

    private static QuotaService CreateService(IUserUsageRepository repository, IClock clock) =>
        new(repository, clock, Options.Create(new AppOptions()));

    [Fact]
    public async Task User_Without_Usage_Has_Quota_Available()
    {
        var clock = new FakeClock();
        var repository = new FakeUserUsageRepository();
        var service = CreateService(repository, clock);

        var hasQuota = await service.HasQuotaAvailableAsync(Guid.NewGuid(), CancellationToken.None);

        Assert.True(hasQuota);
    }

    [Fact]
    public async Task User_At_Daily_Limit_Has_No_Quota_Available()
    {
        var clock = new FakeClock();
        var repository = new FakeUserUsageRepository();
        var service = CreateService(repository, clock);
        var userId = Guid.NewGuid();

        for (var i = 0; i < IQuotaService.DailyLimit; i++)
        {
            await service.ConsumeQuotaAsync(userId, tokensUsed: 10, CancellationToken.None);
        }

        var hasQuota = await service.HasQuotaAvailableAsync(userId, CancellationToken.None);
        var remaining = await service.GetRemainingQuotaAsync(userId, CancellationToken.None);

        Assert.False(hasQuota);
        Assert.Equal(0, remaining);
    }
}
