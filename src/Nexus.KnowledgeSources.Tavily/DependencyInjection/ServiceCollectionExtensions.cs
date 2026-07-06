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
        services.Configure<TavilyOptions>(configuration.GetSection("Tavily"));
        services.AddHttpClient(TavilyWebContentExtractor.HttpClientName);
        services.AddScoped<IWebContentExtractor, TavilyWebContentExtractor>();

        return services;
    }
}
