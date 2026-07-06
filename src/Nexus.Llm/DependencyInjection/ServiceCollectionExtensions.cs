using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Nexus.Llm.DeepSeek.DependencyInjection;

namespace Nexus.Llm.DependencyInjection;

/// <summary>
/// Resolve a implementacao de ILlmProvider com base na configuracao "Llm:Provider" (env var LLM_PROVIDER).
/// Somente "deepseek" e suportado nesta fase; qualquer outro valor falha de forma explicita na inicializacao.
/// </summary>
public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddLlmProviders(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        services.Configure<LlmOptions>(configuration.GetSection("Llm"));

        var provider = configuration["Llm:Provider"] ?? "deepseek";

        switch (provider.Trim().ToLowerInvariant())
        {
            case "deepseek":
                services.AddDeepSeekProvider(configuration);
                break;
            default:
                throw new InvalidOperationException(
                    $"Provedor de LLM '{provider}' nao e suportado. Provedores suportados: 'deepseek'."
                );
        }

        return services;
    }
}
