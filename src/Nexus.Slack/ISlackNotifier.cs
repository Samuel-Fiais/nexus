namespace Nexus.Slack;

public interface ISlackNotifier
{
    Task PostMessageAsync(string channelId, string? threadTs, string text, CancellationToken ct);
}
