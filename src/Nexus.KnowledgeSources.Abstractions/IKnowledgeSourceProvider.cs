using Nexus.Domain.Entities;

namespace Nexus.KnowledgeSources.Abstractions;

public interface IKnowledgeSourceProvider
{
    Task<IReadOnlyList<SourceItem>> ListItemsAsync(KnowledgeSource source, CancellationToken ct);

    Task<string> ReadContentAsync(KnowledgeSource source, SourceItem item, CancellationToken ct);
}
