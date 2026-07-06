namespace Nexus.KnowledgeSources.LocalFolder;

// Nome mantido como "KnowledgeOptions" (em vez de "LocalFolderOptions") para minimizar o diff
// de configuracao (appsettings.json continua usando a secao "Knowledge").
public class KnowledgeOptions
{
    public string? LocalFolderPath { get; set; }
}
