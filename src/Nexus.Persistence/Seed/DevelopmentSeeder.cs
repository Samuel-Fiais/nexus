using Microsoft.EntityFrameworkCore;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;

namespace Nexus.Persistence.Seed;

/// <summary>
/// Seeds minimos para desenvolvimento local (task 1.10): garante uma KnowledgeSource do tipo
/// LocalFolder apontando para a pasta configurada, criando a pasta e um documento markdown de
/// exemplo quando ela nao existe. So deve ser chamado em ambiente de desenvolvimento.
/// </summary>
public static class DevelopmentSeeder
{
    public static async Task SeedAsync(
        NexusDbContext db,
        string localFolderPath,
        CancellationToken ct = default
    )
    {
        if (!await db.KnowledgeSources.AnyAsync(ct))
        {
            var now = DateTimeOffset.UtcNow;
            db.KnowledgeSources.Add(
                new KnowledgeSource
                {
                    Id = Guid.NewGuid(),
                    Name = "Pasta local (dev)",
                    Type = KnowledgeSourceType.LocalFolder,
                    UrlOrPath = localFolderPath,
                    Active = true,
                    CreatedAt = now,
                    UpdatedAt = now,
                }
            );
            await db.SaveChangesAsync(ct);
        }

        if (!Directory.Exists(localFolderPath))
        {
            Directory.CreateDirectory(localFolderPath);
            var samplePath = Path.Combine(localFolderPath, "exemplo-boas-vindas.md");
            await File.WriteAllTextAsync(
                samplePath,
                "# Boas-vindas ao assistente de duvidas\n\n"
                    + "Este e um documento de exemplo criado pelo seed de desenvolvimento. "
                    + "Coloque arquivos .md (ou .url/.link contendo uma URL por arquivo) nesta "
                    + "pasta para que o SyncWorker os indexe na base de conhecimento.\n",
                ct
            );
        }
    }
}
