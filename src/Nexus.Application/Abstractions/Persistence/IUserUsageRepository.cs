using Nexus.Domain.Entities;

namespace Nexus.Application.Abstractions.Persistence;

public interface IUserUsageRepository
{
    Task<UserDailyUsage?> GetAsync(Guid userId, DateOnly date, CancellationToken ct);

    Task UpsertAsync(UserDailyUsage usage, CancellationToken ct);

    /// <summary>
    /// Expurgo de registros antigos de uso diario (regra 3.5). Retorna a quantidade removida.
    /// </summary>
    Task<int> DeleteOlderThanAsync(DateOnly cutoffDate, CancellationToken ct);
}
