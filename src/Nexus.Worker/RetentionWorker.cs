using Microsoft.Extensions.Options;
using Nexus.Application.Abstractions.Persistence;

namespace Nexus.Worker;

/// <summary>
/// Expurgo diario de UserDailyUsage antigo (regra 3.5). Interacoes (auditoria) sao mantidas
/// indefinidamente no MVP.
/// </summary>
public class RetentionWorker(
    ILogger<RetentionWorker> logger,
    IServiceScopeFactory scopeFactory,
    IOptions<RetentionOptions> retentionOptions
) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromHours(24);

    private readonly RetentionOptions _options = retentionOptions.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunCleanupAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Erro durante o expurgo de UserDailyUsage antigo.");
            }

            await Task.Delay(Interval, stoppingToken);
        }
    }

    private async Task RunCleanupAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var usageRepository = scope.ServiceProvider.GetRequiredService<IUserUsageRepository>();

        var retentionDays = Math.Max(1, _options.UserDailyUsageDays);
        var cutoff = DateOnly.FromDateTime(DateTime.UtcNow.Date).AddDays(-retentionDays);
        var removed = await usageRepository.DeleteOlderThanAsync(cutoff, ct);

        if (removed > 0)
        {
            logger.LogInformation(
                "Expurgo de uso diario: {Removed} registro(s) anteriores a {Cutoff} removido(s).",
                removed,
                cutoff
            );
        }
    }
}
