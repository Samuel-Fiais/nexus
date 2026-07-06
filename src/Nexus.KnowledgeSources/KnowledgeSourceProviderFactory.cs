using Nexus.Domain.Enums;
using Nexus.KnowledgeSources.Abstractions;
using Nexus.KnowledgeSources.LocalFolder;

namespace Nexus.KnowledgeSources;

/// <summary>
/// Resolve o IKnowledgeSourceProvider apropriado para o tipo de uma KnowledgeSource.
/// Hoje somente LocalFolder e suportado; Notion/GoogleDrive/AzureStorage virao em fases futuras.
/// </summary>
public class KnowledgeSourceProviderFactory(LocalFolderKnowledgeSourceProvider localFolderProvider)
{
    public IKnowledgeSourceProvider GetProvider(KnowledgeSourceType type) =>
        type switch
        {
            KnowledgeSourceType.LocalFolder => localFolderProvider,
            _ => throw new InvalidOperationException(
                $"Tipo de fonte de conhecimento '{type}' nao suportado."
            ),
        };
}
