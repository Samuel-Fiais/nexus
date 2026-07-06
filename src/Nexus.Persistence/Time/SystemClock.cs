using Microsoft.Extensions.Logging;
using Nexus.Application.Abstractions;

namespace Nexus.Persistence.Time;

// NOTA: o plano de refatoracao nao definiu um projeto proprio para esta implementacao trivial
// (sem dependencia de banco alguma, alem de ILogger). Foi agrupada aqui, em Nexus.Persistence,
// junto com as demais implementacoes de infraestrutura "genericas" (SimpleChunkSearchService,
// StubEmbeddingProvider) para evitar criar multiplos projetos quase vazios.
public class SystemClock(ILogger<SystemClock> logger) : IClock
{
    public DateTimeOffset UtcNow => DateTimeOffset.UtcNow;

    public DateOnly TodayInTimezone(string timezoneId)
    {
        TimeZoneInfo timezone;
        try
        {
            timezone = TimeZoneInfo.FindSystemTimeZoneById(timezoneId);
        }
        catch (TimeZoneNotFoundException)
        {
            // Comum em containers Linux sem tzdata instalado. Cai para o offset fixo de
            // America/Sao_Paulo (UTC-3, sem horario de verao desde 2019).
            logger.LogWarning(
                "Timezone '{TimezoneId}' nao encontrada no sistema operacional. Usando fallback UTC-3.",
                timezoneId
            );

            timezone = TimeZoneInfo.CreateCustomTimeZone(
                "UTC-3-Fallback",
                TimeSpan.FromHours(-3),
                "UTC-3",
                "UTC-3"
            );
        }

        var nowInTimezone = TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow, timezone);
        return DateOnly.FromDateTime(nowInTimezone.DateTime);
    }
}
