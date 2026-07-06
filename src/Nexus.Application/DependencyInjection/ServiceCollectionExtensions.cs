using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Nexus.Application.Abstractions;
using Nexus.Application.Embeddings;
using Nexus.Application.Ingestion;
using Nexus.Application.Tags;
using Nexus.Application.UseCases;
using Nexus.Llm.DeepSeek;

namespace Nexus.Application.DependencyInjection;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddNexusApplication(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        services.Configure<AppOptions>(configuration.GetSection("App"));
        services.AddHttpClient(DeepSeekEmbeddingProvider.HttpClientName);

        services.AddScoped<IQuotaService, QuotaService>();
        services.AddScoped<IQuestionOrchestrator, QuestionOrchestrator>();
        services.AddScoped<IEmbeddingProvider, DeepSeekEmbeddingProvider>();
        services.AddScoped<IDocumentIngestionService, DocumentIngestionService>();
        services.AddScoped<ITagGenerationService, LlmTagGenerationService>();
        services.AddScoped<ITagExtractionService, TagExtractionService>();

        return services;
    }
}
