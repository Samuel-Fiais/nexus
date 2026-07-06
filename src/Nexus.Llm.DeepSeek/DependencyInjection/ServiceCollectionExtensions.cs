using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Nexus.Llm.Abstractions;

namespace Nexus.Llm.DeepSeek.DependencyInjection;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddDeepSeekProvider(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        services.Configure<DeepSeekOptions>(configuration.GetSection("DeepSeek"));
        services.AddHttpClient(DeepSeekLlmProvider.HttpClientName);
        services.AddScoped<ILlmProvider, DeepSeekLlmProvider>();

        return services;
    }
}
