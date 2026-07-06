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

// Add services to the container.
builder.Services.AddControllers();

// Learn more about configuring Swagger/OpenAPI at https://aka.ms/aspnetcore/swashbuckle
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();
builder.Services.AddSwaggerGen(options =>
{
    // Permite informar o header X-Admin-Api-Key uma vez no botao "Authorize" do Swagger UI,
    // aplicado automaticamente as chamadas dos endpoints /admin/*.
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

// Hospeda os workers de background (sync de KnowledgeSource e retencao) no proprio processo
// da API, para nao depender de rodar o Nexus.Worker separadamente em desenvolvimento.
builder.Services.Configure<SyncOptions>(builder.Configuration.GetSection("Sync"));
builder.Services.Configure<RetentionOptions>(builder.Configuration.GetSection("Retention"));
builder.Services.AddHostedService<SyncWorker>();
builder.Services.AddHostedService<RetentionWorker>();

var app = builder.Build();

// Aplica migrations e seeds automaticamente em ambiente de desenvolvimento.
if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<NexusDbContext>();
    db.Database.Migrate();

    var localFolderPath = app.Configuration["Knowledge:LocalFolderPath"] ?? "./knowledge";
    await DevelopmentSeeder.SeedAsync(db, localFolderPath);
}

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();

// Exposto para testes de integracao (WebApplicationFactory).
public partial class Program { }
