using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Nexus.KnowledgeSources.Abstractions;

namespace Nexus.KnowledgeSources.Tavily.DependencyInjection;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddTavilyWebContentExtractor(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        services.AddHttpClient(FirecrawlWebContentExtractor.HttpClientName);
        services.AddScoped<IWebContentExtractor, FirecrawlWebContentExtractor>();

        return services;
    }
}
