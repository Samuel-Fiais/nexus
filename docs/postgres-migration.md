# Checklist de migração SQLite → Postgres (task 12.1)

O acesso a dados é isolado em `Nexus.Persistence` (EF Core + repositórios), então a migração
não deve tocar `Nexus.Application`/`Nexus.Domain`.

## Passos

1. **Trocar o provider EF Core**
   - Em `Nexus.Persistence.csproj`: substituir `Microsoft.EntityFrameworkCore.Sqlite` por
     `Npgsql.EntityFrameworkCore.PostgreSQL`.
   - Em `ServiceCollectionExtensions.AddNexusPersistence`: trocar `options.UseSqlite(...)`
     por `options.UseNpgsql(...)`.
   - Atualizar `ConnectionStrings:Default` (ex.: `Host=...;Database=nexus;Username=...;Password=...`).

2. **Regerar migrations**
   - As migrations existentes foram geradas para SQLite. Apagar `src/Nexus.Persistence/Migrations`
     e gerar uma nova `InitialCreate` com o provider Npgsql:
     `dotnet dotnet-ef migrations add InitialCreate --project src/Nexus.Persistence --startup-project src/Nexus.Api -o Migrations`.
   - Migrar os dados existentes por script (dump/import), se necessário.

3. **Revisar tipos de coluna**
   - `Interaction.SourcesJson`, `Interaction.TagsMatchedJson`, `KnowledgeSource.MetadataJson`,
     `DocumentChunk.MetadataJson`: hoje `TEXT`; em Postgres considerar `jsonb` (`HasColumnType("jsonb")`).
   - `DocumentChunk.Embedding`: hoje `byte[]` (BLOB). Ver item 4.
   - `DateOnly`/`DateTimeOffset` são mapeados nativamente pelo Npgsql (`date`/`timestamptz`) — validar
     comparações de data no `UserUsageRepository`/`AdminController`.

4. **Busca vetorial: trocar in-memory por pgvector**
   - `VectorChunkSearchService` carrega os chunks candidatos e calcula cosseno em memória —
     adequado para SQLite/MVP, não escala em Postgres.
   - Instalar a extensão `pgvector` e o pacote `Pgvector.EntityFrameworkCore`; trocar
     `DocumentChunk.Embedding` de `byte[]` para `Vector` e criar índice `ivfflat`/`hnsw`.
   - Reimplementar `IChunkSearchService` com `ORDER BY embedding <=> @query LIMIT @topK`
     (a interface não muda; o pré-filtro por tags vira um `WHERE document_id IN (...)`).
   - Reindexar todos os documentos após a troca.

5. **Concorrência**
   - `ExecuteDeleteAsync` (retenção) e os upserts continuam funcionando; revisar isolamento se
     API e Worker passarem a rodar em múltiplas réplicas (ex.: advisory lock no ciclo de sync).
