namespace Nexus.Application.Abstractions;

/// <summary>
/// Abstrai o relogio do sistema e a resolucao de "hoje" em um timezone especifico,
/// permitindo mock em testes e centralizando a regra de reset diario (America/Sao_Paulo).
/// </summary>
public interface IClock
{
    DateTimeOffset UtcNow { get; }

    DateOnly TodayInTimezone(string timezoneId);
}
