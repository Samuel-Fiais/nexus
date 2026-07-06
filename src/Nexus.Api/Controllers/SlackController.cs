using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Application.UseCases;
using Nexus.Slack;

namespace Nexus.Api.Controllers;

[ApiController]
[Route("slack")]
public class SlackController(
    SlackSignatureValidator signatureValidator,
    IOptions<SlackOptions> slackOptions,
    IServiceScopeFactory scopeFactory,
    ILogger<SlackController> logger
) : ControllerBase
{
    private readonly SlackOptions _slackOptions = slackOptions.Value;

    [HttpPost("events")]
    public async Task<IActionResult> HandleEventAsync(CancellationToken ct)
    {
        // Le o corpo cru antes de qualquer model binding, pois a assinatura do Slack e
        // calculada sobre os bytes exatos do corpo da requisicao.
        Request.EnableBuffering();
        using var reader = new StreamReader(Request.Body, leaveOpen: true);
        var rawBody = await reader.ReadToEndAsync(ct);
        Request.Body.Position = 0;

        using var jsonDocument = JsonDocument.Parse(
            string.IsNullOrWhiteSpace(rawBody) ? "{}" : rawBody
        );
        var root = jsonDocument.RootElement;

        // O challenge de url_verification e respondido sem validar assinatura de usuario,
        // conforme documentacao do Slack (usado apenas na configuracao inicial do endpoint).
        if (
            root.TryGetProperty("type", out var typeProp)
            && typeProp.GetString() == "url_verification"
        )
        {
            var challenge = root.TryGetProperty("challenge", out var challengeProp)
                ? challengeProp.GetString()
                : null;
            return Ok(new { challenge });
        }

        var timestamp = Request.Headers["X-Slack-Request-Timestamp"].ToString();
        var signature = Request.Headers["X-Slack-Signature"].ToString();

        if (
            !signatureValidator.IsValid(
                _slackOptions.SigningSecret ?? string.Empty,
                timestamp,
                rawBody,
                signature
            )
        )
        {
            logger.LogWarning("Assinatura invalida recebida no endpoint /slack/events.");
            return Unauthorized();
        }

        // Regra 9.1: autorizacao por workspace. Se Slack:AllowedTeamId estiver configurado,
        // eventos de qualquer outro workspace sao ignorados (200 sem processamento).
        if (!string.IsNullOrWhiteSpace(_slackOptions.AllowedTeamId))
        {
            var teamId = root.TryGetProperty("team_id", out var teamProp)
                ? teamProp.GetString()
                : null;
            if (teamId != _slackOptions.AllowedTeamId)
            {
                logger.LogWarning(
                    "Evento de workspace nao autorizado ignorado (team_id={TeamId}).",
                    teamId
                );
                return Ok();
            }
        }

        if (!root.TryGetProperty("event", out var eventElement))
        {
            return Ok();
        }

        var eventType = eventElement.TryGetProperty("type", out var evtType)
            ? evtType.GetString()
            : null;
        if (eventType is not ("message" or "app_mention"))
        {
            return Ok();
        }

        // Ignora mensagens enviadas pelo proprio bot para evitar loop.
        if (eventElement.TryGetProperty("bot_id", out _))
        {
            return Ok();
        }

        var slackUserId = eventElement.TryGetProperty("user", out var userProp)
            ? userProp.GetString()
            : null;
        var text = eventElement.TryGetProperty("text", out var textProp)
            ? textProp.GetString()
            : null;
        var channelId = eventElement.TryGetProperty("channel", out var channelProp)
            ? channelProp.GetString()
            : null;
        var threadTs = eventElement.TryGetProperty("thread_ts", out var threadProp)
            ? threadProp.GetString()
            : null;
        var slackEventId = root.TryGetProperty("event_id", out var eventIdProp)
            ? eventIdProp.GetString()
            : null;

        if (
            string.IsNullOrWhiteSpace(slackUserId)
            || string.IsNullOrWhiteSpace(text)
            || string.IsNullOrWhiteSpace(slackEventId)
        )
        {
            return Ok();
        }

        var request = new SlackQuestionRequest(
            slackUserId,
            null,
            channelId,
            threadTs,
            slackEventId,
            text
        );

        _ = Task.Run(
            () =>
                ProcessSlackEventAsync(
                    request,
                    channelId,
                    threadTs,
                    Request.Scheme,
                    Request.Host.Value
                ),
            CancellationToken.None
        );
        return Ok();
    }

    private async Task ProcessSlackEventAsync(
        SlackQuestionRequest request,
        string? channelId,
        string? threadTs,
        string requestScheme,
        string requestHost
    )
    {
        try
        {
            using var scope = scopeFactory.CreateScope();
            var orchestrator = scope.ServiceProvider.GetRequiredService<IQuestionOrchestrator>();
            var slackNotifier = scope.ServiceProvider.GetRequiredService<ISlackNotifier>();
            var documentRepository =
                scope.ServiceProvider.GetRequiredService<IDocumentRepository>();

            using var timeoutCts = new CancellationTokenSource(TimeSpan.FromMinutes(2));
            var result = await orchestrator.HandleQuestionAsync(request, timeoutCts.Token);

            if (
                result.ShouldNotifySlack
                && !string.IsNullOrWhiteSpace(result.Answer)
                && !string.IsNullOrWhiteSpace(channelId)
            )
            {
                var answer = await BuildSlackAnswerAsync(
                    result.Answer,
                    result.UsedSources,
                    documentRepository,
                    requestScheme,
                    requestHost,
                    timeoutCts.Token
                );
                await slackNotifier.PostMessageAsync(channelId, threadTs, answer, timeoutCts.Token);
            }
        }
        catch (Exception ex)
        {
            logger.LogError(
                ex,
                "Erro ao processar evento do Slack em background (event_id={SlackEventId}).",
                request.SlackEventId
            );
        }
    }

    private async Task<string> BuildSlackAnswerAsync(
        string answer,
        IReadOnlyList<string>? usedSources,
        IDocumentRepository documentRepository,
        string requestScheme,
        string requestHost,
        CancellationToken ct
    )
    {
        if (usedSources is null || usedSources.Count == 0)
        {
            return answer;
        }

        var documents = await documentRepository.GetByTitlesAsync(usedSources, ct);
        var linkByTitle = documents
            .GroupBy(d => d.Title)
            .ToDictionary(
                group => group.Key,
                group => BuildAbsoluteDocumentUrl(group.First().Id, requestScheme, requestHost)
            );

        var linkedLines = usedSources.Select(title =>
            linkByTitle.TryGetValue(title, out var url) ? $"• <{url}|{title}>" : $"• {title}"
        );

        var marker = "Fontes consultadas:";
        var markerIndex = answer.IndexOf(marker, StringComparison.Ordinal);
        if (markerIndex < 0)
        {
            return answer;
        }

        return answer[..markerIndex].TrimEnd()
            + "\n\n"
            + marker
            + "\n"
            + string.Join("\n", linkedLines);
    }

    private static string BuildAbsoluteDocumentUrl(
        Guid documentId,
        string requestScheme,
        string requestHost
    ) => $"{requestScheme}://{requestHost}/knowledge/documents/{documentId}";
}
