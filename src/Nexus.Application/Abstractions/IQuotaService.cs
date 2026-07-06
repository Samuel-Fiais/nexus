namespace Nexus.Application.Abstractions;

public interface IQuotaService
{
    /// <summary>
    /// Limite diario de perguntas por usuario (slack_user_id), resetado por dia no timezone America/Sao_Paulo.
    /// </summary>
    const int DailyLimit = 10;

    Task<bool> HasQuotaAvailableAsync(Guid userId, CancellationToken ct);

    Task ConsumeQuotaAsync(Guid userId, int tokensUsed, CancellationToken ct);

    Task<int> GetRemainingQuotaAsync(Guid userId, CancellationToken ct);
}
