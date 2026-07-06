using Nexus.Application.DependencyInjection;
using Nexus.KnowledgeSources.DependencyInjection;
using Nexus.Llm.DependencyInjection;
using Nexus.Persistence.DependencyInjection;
using Nexus.Worker;
using Serilog;

var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddSerilog(
    (services, configuration) =>
        configuration
            .ReadFrom.Configuration(builder.Configuration)
            .Enrich.FromLogContext()
            .WriteTo.Console()
            .WriteTo.File(
                "logs/nexus-worker-.log",
                rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: 14
            )
);

builder.Services.Configure<SyncOptions>(builder.Configuration.GetSection("Sync"));
builder.Services.Configure<RetentionOptions>(builder.Configuration.GetSection("Retention"));
builder.Services.AddNexusApplication(builder.Configuration);
builder.Services.AddNexusPersistence(builder.Configuration);
builder.Services.AddLlmProviders(builder.Configuration);
builder.Services.AddKnowledgeSourceProviders(builder.Configuration);
builder.Services.AddHostedService<SyncWorker>();
builder.Services.AddHostedService<RetentionWorker>();

var host = builder.Build();
host.Run();
