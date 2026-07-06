using Microsoft.EntityFrameworkCore;
using Microsoft.OpenApi.Models;
using Nexus.Api.Admin;
using Nexus.Application.DependencyInjection;
using Nexus.KnowledgeSources.DependencyInjection;
using Nexus.Llm.DependencyInjection;
using Nexus.Persistence;
using Nexus.Persistence.DependencyInjection;
using Nexus.Persistence.Seed;
using Nexus.Slack.DependencyInjection;
using Nexus.Worker;
using Scalar.AspNetCore;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog(
    (context, services, configuration) =>
        configuration
            .ReadFrom.Configuration(context.Configuration)
            .Enrich.FromLogContext()
            .WriteTo.Console()
            .WriteTo.File(
                "logs/nexus-api-.log",
                rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: 14
            )
);

builder.Services.AddControllers();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.AddSecurityDefinition(
        AdminApiKeyFilter.HeaderName,
        new OpenApiSecurityScheme
        {
            Name = AdminApiKeyFilter.HeaderName,
            Type = SecuritySchemeType.ApiKey,
            In = ParameterLocation.Header,
            Description = "Chave de administrador (Admin:ApiKey) exigida pelos endpoints /admin/*."
        }
    );
    options.AddSecurityRequirement(
        new OpenApiSecurityRequirement
        {
            {
                new OpenApiSecurityScheme
                {
                    Reference = new OpenApiReference
                    {
                        Type = ReferenceType.SecurityScheme,
                        Id = AdminApiKeyFilter.HeaderName
                    }
                },
                []
            }
        }
    );
});

builder.Services.AddNexusApplication(builder.Configuration);
builder.Services.AddNexusPersistence(builder.Configuration);
builder.Services.AddLlmProviders(builder.Configuration);
builder.Services.AddKnowledgeSourceProviders(builder.Configuration);
builder.Services.AddSlackIntegration(builder.Configuration);

builder.Services.Configure<AdminOptions>(builder.Configuration.GetSection("Admin"));
builder.Services.AddScoped<AdminApiKeyFilter>();

builder.Services.Configure<SyncOptions>(builder.Configuration.GetSection("Sync"));
builder.Services.Configure<RetentionOptions>(builder.Configuration.GetSection("Retention"));
builder.Services.AddHostedService<SyncWorker>();
builder.Services.AddHostedService<RetentionWorker>();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<NexusDbContext>();
    db.Database.Migrate();

    var localFolderPath = app.Configuration["Knowledge:LocalFolderPath"] ?? "./knowledge";
    await DevelopmentSeeder.SeedAsync(db, localFolderPath);
}

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.MapScalarApiReference(options =>
    {
        options.WithOpenApiRoutePattern("/swagger/v1/swagger.json");
    });
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();
app.Run();

public partial class Program { }
