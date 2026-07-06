using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace Nexus.Slack.DependencyInjection;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddSlackIntegration(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        services.Configure<SlackOptions>(configuration.GetSection("Slack"));
        services.AddHttpClient(SlackNotifier.HttpClientName);
        services.AddScoped<ISlackNotifier, SlackNotifier>();
        services.AddScoped<SlackSignatureValidator>();

        return services;
    }
}
