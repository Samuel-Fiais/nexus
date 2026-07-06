namespace Nexus.Worker;

// Movido de Nexus.Application/Options: usado exclusivamente pelo SyncWorker, sem necessidade
// de residir em um projeto compartilhado.
public class SyncOptions
{
    public int IntervalMinutes { get; set; } = 15;
}
