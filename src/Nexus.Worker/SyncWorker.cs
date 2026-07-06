using Microsoft.Extensions.Options;
using Nexus.Application.Abstractions;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Domain.Enums;
using Nexus.KnowledgeSources;

namespace Nexus.Worker;

/// <summary>
/// A cada intervalo configurado, varre as KnowledgeSource ativas, le o conteudo de cada item
/// via IKnowledgeSourceProvider e delega a indexacao (hash, chunking, embeddings, auto-tagging)
/// ao IDocumentIngestionService. Ao final do ciclo de cada fonte, atualiza last_sync_at.
/// </summary>
public class SyncWorker(
    ILogger<SyncWorker> logger,
    IServiceScopeFactory scopeFactory,
    IOptions<SyncOptions> syncOptions
) : BackgroundService
{
    private readonly SyncOptions _syncOptions = syncOptions.Value;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var interval = TimeSpan.FromMinutes(Math.Max(1, _syncOptions.IntervalMinutes));

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await RunSyncCycleAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogError(
                    ex,
                    "Erro durante o ciclo de sincronizacao da base de conhecimento."
                );
            }

            await Task.Delay(interval, stoppingToken);
        }
    }

    private async Task RunSyncCycleAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var sourceRepository =
            scope.ServiceProvider.GetRequiredService<IKnowledgeSourceRepository>();
        var documentRepository = scope.ServiceProvider.GetRequiredService<IDocumentRepository>();
        var ingestionService =
            scope.ServiceProvider.GetRequiredService<IDocumentIngestionService>();
        var clock = scope.ServiceProvider.GetRequiredService<IClock>();
        var providerFactory =
            scope.ServiceProvider.GetRequiredService<KnowledgeSourceProviderFactory>();

        var sources = await sourceRepository.GetActiveAsync(ct);
        logger.LogInformation(
            "Iniciando ciclo de sincronizacao com {Count} fonte(s) ativa(s).",
            sources.Count
        );

        foreach (var source in sources)
        {
            var provider = providerFactory.GetProvider(source.Type);
            var items = await provider.ListItemsAsync(source, ct);
            var indexed = 0;

            foreach (var item in items)
            {
                try
                {
                    // Reindexacao de URLs (WebsiteLink) fica desativada por enquanto: se o
                    // documento ja existe, nao extraimos o conteudo de novo (evita chamadas
                    // desnecessarias/repetidas a extractors externos como a Tavily a cada ciclo).
                    // Demais tipos (ex: Markdown, Pdf) sao relidos e reindexados quando o
                    // conteudo muda (ver DocumentIngestionService).
                    if (item.ContentType == DocumentContentType.WebsiteLink)
                    {
                        var existingDocument =
                            await documentRepository.GetBySourceAndExternalIdAsync(
                                source.Id,
                                item.ExternalId,
                                ct
                            );
                        if (existingDocument is not null)
                        {
                            continue;
                        }
                    }

                    var content = await provider.ReadContentAsync(source, item, ct);
                    var reindexed = await ingestionService.IngestAsync(
                        source.Id,
                        item.ExternalId,
                        item.Title,
                        item.ContentType,
                        content,
                        ct
                    );
                    if (reindexed)
                    {
                        indexed++;
                    }
                }
                catch (OperationCanceledException) when (ct.IsCancellationRequested)
                {
                    throw;
                }
                catch (Exception ex)
                {
                    // Falha em um item (ex: extracao web indisponivel) nao interrompe a fonte.
                    logger.LogError(
                        ex,
                        "Falha ao sincronizar o item '{ExternalId}' da fonte '{SourceName}'.",
                        item.ExternalId,
                        source.Name
                    );
                }
            }

            source.LastSyncAt = clock.UtcNow;
            source.UpdatedAt = clock.UtcNow;
            await sourceRepository.UpdateAsync(source, ct);

            logger.LogInformation(
                "Fonte '{SourceName}' sincronizada: {Total} item(ns), {Indexed} (re)indexado(s).",
                source.Name,
                items.Count,
                indexed
            );
        }
    }
}
