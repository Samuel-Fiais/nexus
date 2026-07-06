using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Nexus.KnowledgeSources.FileExtractors.DependencyInjection;

namespace Nexus.KnowledgeSources.LocalFolder.DependencyInjection;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddLocalFolderKnowledgeSource(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        services.Configure<KnowledgeOptions>(configuration.GetSection("Knowledge"));
        services.AddFileContentExtractors();
        services.AddScoped<LocalFolderKnowledgeSourceProvider>();

        return services;
    }
}
