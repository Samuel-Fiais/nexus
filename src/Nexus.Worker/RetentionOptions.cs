namespace Nexus.Worker;

public class RetentionOptions
{
    /// <summary>
    /// Dias de retencao dos registros de UserDailyUsage (regra 3.5). Registros com data
    /// anterior a hoje - N dias sao expurgados diariamente pelo RetentionWorker.
    /// </summary>
    public int UserDailyUsageDays { get; set; } = 90;
}
