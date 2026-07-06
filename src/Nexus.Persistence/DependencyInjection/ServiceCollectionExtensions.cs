using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Nexus.Application.Abstractions;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Persistence.Repositories;
using Nexus.Persistence.Search;
using Nexus.Persistence.Time;

namespace Nexus.Persistence.DependencyInjection;

public static class ServiceCollectionExtensions
{
    public static IServiceCollection AddNexusPersistence(
        this IServiceCollection services,
        IConfiguration configuration
    )
    {
        var connectionString =
            configuration.GetConnectionString("Default") ?? "Data Source=nexus.db";

        services.AddDbContext<NexusDbContext>(options => options.UseSqlite(connectionString));

        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IUserUsageRepository, UserUsageRepository>();
        services.AddScoped<IInteractionRepository, InteractionRepository>();
        services.AddScoped<IConversationSessionRepository, ConversationSessionRepository>();
        services.AddScoped<IKnowledgeSourceRepository, KnowledgeSourceRepository>();
        services.AddScoped<IDocumentRepository, DocumentRepository>();
        services.AddScoped<IDocumentChunkRepository, DocumentChunkRepository>();
        services.AddScoped<ITagRepository, TagRepository>();
        services.AddScoped<ITagBasedRetriever, TagBasedRetriever>();

        // Ports de Nexus.Application sem projeto proprio designado no plano de reorganizacao;
        // registrados aqui por serem implementacoes triviais de infraestrutura. Ver comentario
        // em Nexus.Persistence/Time/SystemClock.cs.
        services.AddScoped<IClock, SystemClock>();
        services.AddScoped<IChunkSearchService, VectorChunkSearchService>();

        return services;
    }
}
