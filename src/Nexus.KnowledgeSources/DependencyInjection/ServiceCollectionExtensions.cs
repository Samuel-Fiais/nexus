using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Nexus.KnowledgeSources.LocalFolder.DependencyInjection;
using Nexus.KnowledgeSources.Tavily.DependencyInjection;

namespace Nexus.KnowledgeSources.DependencyInjection;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddKnowledgeSourceProviders(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        services.AddTavilyWebContentExtractor(configuration);
        services.AddLocalFolderKnowledgeSource(configuration);
        services.AddScoped<KnowledgeSourceProviderFactory>();

        return services;
    }
}
