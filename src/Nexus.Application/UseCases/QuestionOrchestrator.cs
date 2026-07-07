using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Nexus.Application.Abstractions;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Application.Embeddings;
using Nexus.Application.Prompts;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Llm.Abstractions;

namespace Nexus.Application.UseCases;

public interface IQuestionOrchestrator
{
    /// <summary>
    /// Processa uma pergunta recebida do Slack de ponta a ponta: identifica/cria o usuario,
    /// checa cota, checa idempotencia, busca contexto (pre-filtro por tags + busca vetorial
    /// com fallback), chama o LLM, persiste a interacao e retorna o texto de resposta a ser
    /// postado no Slack.
    /// </summary>
    Task<SlackQuestionResult> HandleQuestionAsync(
        SlackQuestionRequest request,
        CancellationToken ct
    );
}

public record SlackQuestionRequest(
    string SlackUserId,
    string? SlackUserName,
    string? SlackChannelId,
    string? SlackThreadTs,
    string SlackEventId,
    string Question
);

public record SlackQuestionResult(
    string Answer,
    bool ShouldNotifySlack,
    IReadOnlyList<string>? UsedSources = null
);

public partial class QuestionOrchestrator(
    IUserRepository userRepository,
    IInteractionRepository interactionRepository,
    IConversationSessionRepository conversationSessionRepository,
    IDocumentRepository documentRepository,
    IQuotaService quotaService,
    ILlmProvider llmProvider,
    IEmbeddingProvider embeddingProvider,
    IChunkSearchService chunkSearchService,
    ITagExtractionService tagExtractionService,
    ITagBasedRetriever tagBasedRetriever,
    IClock clock,
    IOptions<AppOptions> appOptions,
    ILogger<QuestionOrchestrator> logger
) : IQuestionOrchestrator
{
    private const int TopK = 5;
    private const int RetryTopK = 12;

    /// <summary>
    /// Acima desse numero de documentos, o match por titulo deixou de ser um "hint" preciso
    /// (termos genericos demais) e passaria a diluir o contexto com ruido em vez de ajudar.
    /// </summary>
    private const int MaxTitleHintDocuments = 8;
    private const string SourcesUsedMarker = "SOURCES_USED:";

    private readonly AppOptions _appOptions = appOptions.Value;

    public async Task<SlackQuestionResult> HandleQuestionAsync(
        SlackQuestionRequest request,
        CancellationToken ct
    )
    {
        using var userScope = logger.BeginScope(
            new Dictionary<string, object>
            {
                ["slack_user_id"] = request.SlackUserId,
                ["slack_event_id"] = request.SlackEventId,
            }
        );

        var existing = await interactionRepository.GetBySlackEventIdAsync(request.SlackEventId, ct);
        if (existing is not null)
        {
            logger.LogInformation(
                "Evento Slack duplicado ignorado (interaction_id={InteractionId}).",
                existing.Id
            );
            return new SlackQuestionResult(
                existing.Answer ?? string.Empty,
                ShouldNotifySlack: false
            );
        }

        var user = await GetOrCreateUserAsync(request, ct);
        var session = await GetOrCreateSessionAsync(user.Id, request, ct);
        var sessionHistory = await interactionRepository.GetByConversationSessionWindowAsync(
            session.Id,
            session.CurrentWindowNumber,
            ct
        );

        if (!user.Active)
        {
            logger.LogWarning("Usuario inativo tentou usar o assistente.");
            return new SlackQuestionResult(
                "Sua conta está inativa para uso do assistente. Contate um administrador.",
                ShouldNotifySlack: true
            );
        }

        if (!await quotaService.HasQuotaAvailableAsync(user.Id, ct))
        {
            var quotaInteraction = await SaveInteractionAsync(
                userId: user.Id,
                conversationSessionId: session.Id,
                sessionWindowNumber: session.CurrentWindowNumber,
                request: request,
                answer: null,
                status: InteractionStatus.QuotaExceeded,
                model: null,
                tokensUsed: null,
                inputTokens: null,
                outputTokens: null,
                cachedTokens: null,
                estimatedCostUsd: null,
                errorMessage: "Cota diaria excedida.",
                sourcesJson: null,
                tagsMatchedJson: null,
                ct
            );
            logger.LogInformation(
                "Cota diaria excedida (interaction_id={InteractionId}).",
                quotaInteraction.Id
            );
            return new SlackQuestionResult(
                "Você atingiu o limite diário de perguntas. Tente novamente amanhã.",
                ShouldNotifySlack: true
            );
        }

        try
        {
            // Regra 8.4: timeout explicito ao redor de busca + LLM, sem cancelar o fluxo do
            // chamador (o token de timeout e vinculado ao token original).
            using var timeoutCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
            timeoutCts.CancelAfter(
                TimeSpan.FromSeconds(Math.Max(5, _appOptions.LlmTimeoutSeconds))
            );
            var flowCt = timeoutCts.Token;

            // Epico 7: pre-filtro por tags com fallback para busca vetorial completa.
            var matchedTagSlugs = await tagExtractionService.ExtractMatchingTagSlugsAsync(
                request.Question,
                flowCt
            );

            IReadOnlyList<Guid> taggedDocumentIds = [];
            if (matchedTagSlugs.Count > 0)
            {
                taggedDocumentIds = await tagBasedRetriever.GetDocumentIdsByTagSlugsAsync(
                    matchedTagSlugs,
                    flowCt
                );
            }

            var questionEmbedding = await embeddingProvider.GenerateEmbeddingAsync(
                request.Question,
                flowCt
            );

            var usedTagFilter = taggedDocumentIds.Count > 0;
            var chunks = await chunkSearchService.SearchAsync(
                questionEmbedding,
                TopK,
                usedTagFilter ? taggedDocumentIds : null,
                flowCt
            );

            // Regra 7.4: se a busca restrita por tags nao retornou chunks relevantes,
            // cai para a busca vetorial completa em toda a base.
            if (usedTagFilter && chunks.Count == 0)
            {
                usedTagFilter = false;
                chunks = await chunkSearchService.SearchAsync(
                    questionEmbedding,
                    TopK,
                    null,
                    flowCt
                );
            }

            // A busca vetorial (feature hashing) pode nao trazer todos os documentos relevantes
            // quando a pergunta cita varios temas (ex: "quais apps existem"). Complementamos
            // sempre, e nao so no retry de "sem informacao", com documentos cujo titulo bate com
            // termos da pergunta, para nao perder fontes relevantes na primeira resposta.
            var titleHintDocumentIds = await FindTitleHintDocumentIdsAsync(
                request.Question,
                flowCt
            );
            if (
                titleHintDocumentIds.Count > 0
                && titleHintDocumentIds.Count <= MaxTitleHintDocuments
            )
            {
                var titleHintChunks = await chunkSearchService.SearchAsync(
                    questionEmbedding,
                    RetryTopK,
                    titleHintDocumentIds,
                    flowCt,
                    enforceMinScore: false
                );

                if (titleHintChunks.Count > 0)
                {
                    chunks = MergeChunks(chunks, titleHintChunks, RetryTopK);
                }
            }

            logger.LogInformation(
                "Busca de contexto: {ChunkCount} chunk(s), tags_matched={TagsMatched}, tag_filter={UsedTagFilter}.",
                chunks.Count,
                string.Join(",", matchedTagSlugs),
                usedTagFilter
            );

            var systemPrompt = BuildSystemPrompt();
            var effectiveChunks = chunks;
            var userPrompt = BuildUserPrompt(
                request.Question,
                effectiveChunks,
                session,
                sessionHistory
            );

            var result = await llmProvider.GenerateAnswerAsync(systemPrompt, userPrompt, flowCt);
            var tokensUsed = (result.PromptTokens ?? 0) + (result.CompletionTokens ?? 0);
            var inputTokens = result.PromptTokens ?? 0;
            var outputTokens = result.CompletionTokens ?? 0;
            var cachedTokens = result.CachedTokens ?? 0;
            var costUsd = result.EstimatedCostUsd ?? 0m;

            if (effectiveChunks.Count > 0 && LooksLikeNoInfoAnswer(result.Answer))
            {
                if (usedTagFilter)
                {
                    var broaderChunks = await chunkSearchService.SearchAsync(
                        questionEmbedding,
                        RetryTopK,
                        null,
                        flowCt
                    );

                    if (broaderChunks.Count > 0)
                    {
                        effectiveChunks = MergeChunks(effectiveChunks, broaderChunks, TopK);
                        logger.LogInformation(
                            "Busca ampliada apos resposta sem informacao: {ChunkCount} chunk(s).",
                            effectiveChunks.Count
                        );
                    }
                }

                var retryPrompt = BuildContextOnlyUserPrompt(request.Question, effectiveChunks);
                var retryResult = await llmProvider.GenerateAnswerAsync(
                    systemPrompt,
                    retryPrompt,
                    flowCt
                );
                result = retryResult;
                tokensUsed += (retryResult.PromptTokens ?? 0) + (retryResult.CompletionTokens ?? 0);
                inputTokens += retryResult.PromptTokens ?? 0;
                outputTokens += retryResult.CompletionTokens ?? 0;
                cachedTokens += retryResult.CachedTokens ?? 0;
                costUsd += retryResult.EstimatedCostUsd ?? 0m;
            }

            var status =
                effectiveChunks.Count == 0
                    ? InteractionStatus.InsufficientContext
                    : InteractionStatus.Success;
            var sourceTitles = effectiveChunks.Select(c => c.DocumentTitle).Distinct().ToList();
            var sourceIds = effectiveChunks
                .Select(c => c.Chunk.DocumentId)
                .Distinct()
                .ToList();
            var usedSourceTitles = ExtractUsedSources(result.Answer, sourceTitles);
            var answer = AppendSources(
                SanitizeAnswer(result.Answer),
                usedSourceTitles,
                sourceIds,
                _appOptions.PublicBaseUrl
            );

            var interaction = await SaveInteractionAsync(
                user.Id,
                session.Id,
                session.CurrentWindowNumber,
                request,
                answer,
                status,
                result.Model,
                tokensUsed,
                inputTokens,
                outputTokens,
                cachedTokens,
                costUsd,
                errorMessage: null,
                sourcesJson: usedSourceTitles.Count > 0
                    ? JsonSerializer.Serialize(usedSourceTitles)
                    : null,
                tagsMatchedJson: matchedTagSlugs.Count > 0
                    ? JsonSerializer.Serialize(matchedTagSlugs)
                    : null,
                ct
            );
            await quotaService.ConsumeQuotaAsync(user.Id, tokensUsed, ct);
            await AdvanceSessionAsync(session, sessionHistory, request.Question, answer, ct);

            logger.LogInformation(
                "Pergunta respondida (interaction_id={InteractionId}, status={Status}, model={Model}, tokens_used={TokensUsed}, cost_usd={CostUsd}).",
                interaction.Id,
                status,
                result.Model,
                tokensUsed,
                costUsd
            );

            return new SlackQuestionResult(
                answer,
                ShouldNotifySlack: true,
                UsedSources: usedSourceTitles
            );
        }
        catch (OperationCanceledException) when (!ct.IsCancellationRequested)
        {
            var interaction = await SaveInteractionAsync(
                userId: user.Id,
                conversationSessionId: session.Id,
                sessionWindowNumber: session.CurrentWindowNumber,
                request: request,
                answer: null,
                status: InteractionStatus.Error,
                model: null,
                tokensUsed: null,
                inputTokens: null,
                outputTokens: null,
                cachedTokens: null,
                estimatedCostUsd: null,
                errorMessage: $"Timeout apos {_appOptions.LlmTimeoutSeconds}s no fluxo de busca/LLM.",
                sourcesJson: null,
                tagsMatchedJson: null,
                ct
            );
            logger.LogError(
                "Timeout no fluxo de busca/LLM (interaction_id={InteractionId}).",
                interaction.Id
            );
            return new SlackQuestionResult(
                "A consulta demorou mais que o esperado. Tente novamente em instantes.",
                ShouldNotifySlack: true
            );
        }
        catch (Exception ex)
        {
            var interaction = await SaveInteractionAsync(
                userId: user.Id,
                conversationSessionId: session.Id,
                sessionWindowNumber: session.CurrentWindowNumber,
                request: request,
                answer: null,
                status: InteractionStatus.Error,
                model: null,
                tokensUsed: null,
                inputTokens: null,
                outputTokens: null,
                cachedTokens: null,
                estimatedCostUsd: null,
                errorMessage: ex.Message,
                sourcesJson: null,
                tagsMatchedJson: null,
                ct
            );
            logger.LogError(
                ex,
                "Erro ao processar pergunta (interaction_id={InteractionId}).",
                interaction.Id
            );
            return new SlackQuestionResult(
                "Ocorreu um erro ao processar sua pergunta. Tente novamente mais tarde.",
                ShouldNotifySlack: true
            );
        }
    }

    private async Task<ConversationSession> GetOrCreateSessionAsync(
        Guid userId,
        SlackQuestionRequest request,
        CancellationToken ct
    )
    {
        var sessionKey = BuildSessionKey(request);
        var session = await conversationSessionRepository.GetBySessionKeyAsync(sessionKey, ct);
        if (session is not null)
        {
            return session;
        }

        session = new ConversationSession
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            SessionKey = sessionKey,
            SlackChannelId = request.SlackChannelId,
            SlackThreadTs = request.SlackThreadTs,
            CurrentWindowNumber = 1,
            MessageCountInWindow = 0,
            TotalMessageCount = 0,
            CreatedAt = clock.UtcNow,
            UpdatedAt = clock.UtcNow,
        };

        await conversationSessionRepository.AddAsync(session, ct);
        return session;
    }

    private static string BuildSessionKey(SlackQuestionRequest request)
    {
        if (!string.IsNullOrWhiteSpace(request.SlackThreadTs))
        {
            return $"slack:{request.SlackUserId}:{request.SlackChannelId}:thread:{request.SlackThreadTs}";
        }

        if (!string.IsNullOrWhiteSpace(request.SlackChannelId))
        {
            return $"slack:{request.SlackUserId}:{request.SlackChannelId}";
        }

        return $"slack:{request.SlackUserId}:direct";
    }

    private async Task AdvanceSessionAsync(
        ConversationSession session,
        IReadOnlyList<Interaction> sessionHistory,
        string question,
        string answer,
        CancellationToken ct
    )
    {
        session.MessageCountInWindow++;
        session.TotalMessageCount++;
        session.UpdatedAt = clock.UtcNow;

        if (session.MessageCountInWindow < Math.Max(1, _appOptions.SessionMessageWindowSize))
        {
            await conversationSessionRepository.UpdateAsync(session, ct);
            return;
        }

        try
        {
            var interactionsToCompact = sessionHistory
                .Concat(
                    [
                        new Interaction
                        {
                            Question = question,
                            Answer = answer,
                            CreatedAt = clock.UtcNow,
                        },
                    ]
                )
                .ToList();

            session.Summary = await CompactSessionAsync(session.Summary, interactionsToCompact, ct);
            session.CurrentWindowNumber++;
            session.MessageCountInWindow = 0;
            session.LastCompactedAt = clock.UtcNow;
            session.UpdatedAt = clock.UtcNow;
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Erro ao compactar sessao {SessionId}.", session.Id);
        }

        await conversationSessionRepository.UpdateAsync(session, ct);
    }

    private async Task<string> CompactSessionAsync(
        string? currentSummary,
        IReadOnlyList<Interaction> interactions,
        CancellationToken ct
    )
    {
        var prompt = BuildSessionCompactionPrompt(currentSummary, interactions);
        var result = await llmProvider.GenerateAnswerAsync(
            BuildSessionCompactionSystemPrompt(),
            prompt,
            ct
        );
        return result.Answer.Trim();
    }

    private async Task<User> GetOrCreateUserAsync(
        SlackQuestionRequest request,
        CancellationToken ct
    )
    {
        var user = await userRepository.GetBySlackUserIdAsync(request.SlackUserId, ct);
        if (user is not null)
        {
            return user;
        }

        user = new User
        {
            Id = Guid.NewGuid(),
            SlackUserId = request.SlackUserId,
            Name = request.SlackUserName ?? request.SlackUserId,
            Email = null,
            Role = UserRole.Common,
            Active = true,
            CreatedAt = clock.UtcNow,
            UpdatedAt = clock.UtcNow,
        };

        await userRepository.AddAsync(user, ct);
        logger.LogInformation("Novo usuario criado a partir do Slack.");
        return user;
    }

    private async Task<Interaction> SaveInteractionAsync(
        Guid userId,
        Guid? conversationSessionId,
        int? sessionWindowNumber,
        SlackQuestionRequest request,
        string? answer,
        InteractionStatus status,
        string? model,
        int? tokensUsed,
        int? inputTokens,
        int? outputTokens,
        int? cachedTokens,
        decimal? estimatedCostUsd,
        string? errorMessage,
        string? sourcesJson,
        string? tagsMatchedJson,
        CancellationToken ct
    )
    {
        var interaction = new Interaction
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            ConversationSessionId = conversationSessionId,
            SessionWindowNumber = sessionWindowNumber,
            SlackChannelId = request.SlackChannelId,
            SlackThreadTs = request.SlackThreadTs,
            SlackEventId = request.SlackEventId,
            Question = request.Question,
            Answer = answer,
            SourcesJson = sourcesJson,
            TagsMatchedJson = tagsMatchedJson,
            Model = model,
            TokensUsed = tokensUsed,
            InputTokens = inputTokens,
            OutputTokens = outputTokens,
            CachedTokens = cachedTokens,
            EstimatedCostUsd = estimatedCostUsd,
            Status = status,
            ErrorMessage = errorMessage,
            CreatedAt = clock.UtcNow,
        };

        await interactionRepository.AddAsync(interaction, ct);
        return interaction;
    }

    private async Task<IReadOnlyList<Guid>> FindTitleHintDocumentIdsAsync(
        string question,
        CancellationToken ct
    )
    {
        var terms = ExtractQuestionTerms(question);
        if (terms.Count == 0)
        {
            return [];
        }

        var documents = await documentRepository.SearchByTitleTermsAsync(terms, ct);
        return documents.Select(document => document.Id).Distinct().ToList();
    }

    private static string BuildSystemPrompt()
    {
        return AgentSoul.BuildSystemPrompt();
    }

    private static string BuildUserPrompt(
        string question,
        IReadOnlyList<ChunkSearchResult> chunks,
        ConversationSession session,
        IReadOnlyList<Interaction> sessionHistory
    )
    {
        var sb = new StringBuilder();
        sb.AppendLine("CONTEXTO RELEVANTE:");
        sb.AppendLine(
            "Use o contexto abaixo como fonte principal de verdade. Se houver conflito entre contexto e histórico da sessão, priorize o contexto."
        );
        if (chunks.Count == 0)
        {
            sb.AppendLine("(nenhum contexto relevante encontrado)");
        }
        else
        {
            foreach (var result in chunks)
            {
                sb.AppendLine(
                    $"- [Documento: \"{result.DocumentTitle}\", parte {result.Chunk.ChunkIndex + 1}] {result.Chunk.Content}"
                );
            }
        }

        sb.AppendLine();
        sb.AppendLine("HISTORICO DA SESSAO:");
        sb.AppendLine(
            "Use o histórico apenas para continuidade de conversa. Não trate o histórico como fonte factual quando o contexto trouxer evidências."
        );
        if (!string.IsNullOrWhiteSpace(session.Summary))
        {
            sb.AppendLine("Resumo compactado das janelas anteriores:");
            sb.AppendLine(session.Summary);
            sb.AppendLine();
        }

        if (sessionHistory.Count == 0)
        {
            sb.AppendLine("(nenhuma mensagem anterior na janela atual)");
        }
        else
        {
            foreach (var interaction in sessionHistory)
            {
                sb.AppendLine($"Usuario: {interaction.Question}");
                if (!string.IsNullOrWhiteSpace(interaction.Answer))
                {
                    sb.AppendLine($"Assistente: {interaction.Answer}");
                }
                sb.AppendLine();
            }
        }

        sb.AppendLine();
        var isFirstMessageOfSession =
            sessionHistory.Count == 0 && string.IsNullOrWhiteSpace(session.Summary);
        sb.AppendLine(
            isFirstMessageOfSession
                ? "Esta e a primeira mensagem da sessao: pode cumprimentar brevemente antes de responder."
                : "Esta NAO e a primeira mensagem da sessao (ja existe historico acima): nao cumprimente "
                    + "novamente (nada de \"Olá\" ou saudacoes similares), va direto para a resposta."
        );
        sb.AppendLine();
        sb.AppendLine("PERGUNTA:");
        sb.AppendLine(question);
        sb.AppendLine();
        sb.AppendLine("TÍTULOS DOS DOCUMENTOS DISPONÍVEIS PARA CITAR EM SOURCES_USED:");
        if (chunks.Count == 0)
        {
            sb.AppendLine("(nenhum)");
        }
        else
        {
            foreach (var title in chunks.Select(c => c.DocumentTitle).Distinct())
            {
                sb.AppendLine($"- {title}");
            }
        }

        return sb.ToString();
    }

    private static string BuildContextOnlyUserPrompt(
        string question,
        IReadOnlyList<ChunkSearchResult> chunks
    )
    {
        var sb = new StringBuilder();
        sb.AppendLine("ATENCAO:");
        sb.AppendLine(
            "O contexto abaixo contem informacoes relevantes e deve ser priorizado para responder."
        );
        sb.AppendLine(
            "Se o contexto trouxer evidencias objetivas, nao responda que a base nao possui informacoes."
        );
        sb.AppendLine();
        sb.AppendLine("CONTEXTO:");
        foreach (var result in chunks)
        {
            sb.AppendLine(
                $"- [Documento: \"{result.DocumentTitle}\", parte {result.Chunk.ChunkIndex + 1}] {result.Chunk.Content}"
            );
        }

        sb.AppendLine();
        sb.AppendLine("PERGUNTA:");
        sb.AppendLine(question);
        sb.AppendLine();
        sb.AppendLine("TÍTULOS DOS DOCUMENTOS DISPONÍVEIS PARA CITAR EM SOURCES_USED:");
        foreach (var title in chunks.Select(c => c.DocumentTitle).Distinct())
        {
            sb.AppendLine($"- {title}");
        }

        return sb.ToString();
    }

    private static string BuildSessionCompactionSystemPrompt() =>
        "Você é um compactador de histórico de conversa. Resuma a sessão em português do Brasil, "
        + "de forma curta e útil para continuidade futura. Preserve fatos importantes, decisões, "
        + "preferências, entidades citadas, dúvidas em aberto e contexto operacional. Não use "
        + "markdown complexo, não liste fontes e não invente informações.";

    private static string BuildSessionCompactionPrompt(
        string? currentSummary,
        IReadOnlyList<Interaction> interactions
    )
    {
        var sb = new StringBuilder();
        sb.AppendLine("RESUMO ANTERIOR:");
        sb.AppendLine(string.IsNullOrWhiteSpace(currentSummary) ? "(nenhum)" : currentSummary);
        sb.AppendLine();
        sb.AppendLine("NOVAS INTERACOES DA JANELA:");
        foreach (var interaction in interactions)
        {
            sb.AppendLine($"Usuario: {interaction.Question}");
            if (!string.IsNullOrWhiteSpace(interaction.Answer))
            {
                sb.AppendLine($"Assistente: {interaction.Answer}");
            }
            sb.AppendLine();
        }

        sb.AppendLine("Gere um novo resumo consolidado para a próxima sessão.");
        return sb.ToString();
    }

    private static string SanitizeAnswer(string answer)
    {
        if (string.IsNullOrWhiteSpace(answer))
        {
            return answer;
        }

        var normalized = answer.Replace("\r\n", "\n");

        // Regex em vez de IndexOf literal: o modelo pode gerar essa secao com formatacao
        // markdown (negrito, "##", espacos extras) que quebraria um match de string exata,
        // deixando ruido da propria secao "auto-gerada" vazar para a resposta final.
        var fontesMatch = FontesConsultadasRegex().Match(normalized);
        if (fontesMatch.Success)
        {
            normalized = normalized[..fontesMatch.Index];
        }

        var sourcesUsedIndex = normalized.IndexOf(
            SourcesUsedMarker,
            StringComparison.OrdinalIgnoreCase
        );
        if (sourcesUsedIndex >= 0)
        {
            normalized = normalized[..sourcesUsedIndex];
        }

        return normalized.TrimEnd();
    }

    private static IReadOnlyList<string> ExtractUsedSources(
        string answer,
        IReadOnlyList<string> availableTitles
    )
    {
        if (string.IsNullOrWhiteSpace(answer) || availableTitles.Count == 0)
        {
            return [];
        }

        var match = SourcesUsedRegex().Match(answer);
        if (!match.Success)
        {
            return [];
        }

        var rawValue = match.Groups[1].Value.Trim();
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return [];
        }

        var availableByNormalized = availableTitles.ToDictionary(NormalizeTitle, title => title);
        var results = new List<string>();

        foreach (
            var candidate in rawValue.Split(
                '|',
                StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries
            )
        )
        {
            var normalizedCandidate = NormalizeTitle(candidate);
            if (
                availableByNormalized.TryGetValue(normalizedCandidate, out var matchedTitle)
                && !results.Contains(matchedTitle)
            )
            {
                results.Add(matchedTitle);
            }
        }

        return results;
    }

    private static string NormalizeTitle(string value)
    {
        var chars = HashingEmbeddingProvider
            .RemoveDiacritics(value.ToLowerInvariant())
            .Where(char.IsLetterOrDigit)
            .ToArray();
        return new string(chars);
    }

    /// <summary>
    /// Palavras conectivas/genericas em portugues que, mesmo com 4+ letras, nao ajudam a
    /// identificar um documento pelo titulo (ex: "como" aparece em quase todo titulo de
    /// artigo de ajuda "X.X-como-fazer-Y" e tornaria o hint por titulo inutil/generico demais).
    /// </summary>
    private static readonly HashSet<string> QuestionTermStopwords = new(StringComparer.Ordinal)
    {
        "como",
        "para",
        "este",
        "esta",
        "isso",
        "essa",
        "esse",
        "aqui",
        "muito",
        "ainda",
        "apenas",
        "sobre",
        "entre",
        "hoje",
        "porque",
        "entao",
        "desde",
        "depois",
        "antes",
        "tudo",
        "toda",
        "todo",
        "cada",
        "pelo",
        "pela",
        "mais",
        "menos",
        "estao",
        "sendo",
        "pode",
        "podem",
        "fazer",
        "feito",
        "quando",
        "onde",
        "quais",
        "qual",
        "existe",
        "existem",
        "tem",
        "tenho",
        "temos",
    };

    private static IReadOnlyList<string> ExtractQuestionTerms(string question)
    {
        return Regex
            .Split(question, @"\W+")
            .Select(token => token.Trim())
            .Where(token => token.Length >= 4)
            .Select(NormalizeTitle)
            .Where(token =>
                !string.IsNullOrWhiteSpace(token) && !QuestionTermStopwords.Contains(token)
            )
            .Distinct()
            .ToList();
    }

    private static readonly string[] NoInfoStems =
    [
        "nao ha informac",
        "nao tenho informac",
        "nao encontrei informac",
        "nao possuo informac",
        "nao localizei informac",
        "nao dispon", // "não disponho de", "não disponível"
        "sem informac",
        "nao ha dado",
        "nao tenho dado",
    ];

    private static bool LooksLikeNoInfoAnswer(string answer)
    {
        // Compara por radicais sem acento para cobrir singular/plural e variações de
        // conjugação (ex: "não tenho informação" vs "não tenho informações").
        var normalized = HashingEmbeddingProvider.RemoveDiacritics(answer.ToLowerInvariant());
        return NoInfoStems.Any(normalized.Contains);
    }

    private static IReadOnlyList<ChunkSearchResult> MergeChunks(
        IReadOnlyList<ChunkSearchResult> primary,
        IReadOnlyList<ChunkSearchResult> secondary,
        int topK
    )
    {
        return primary
            .Concat(secondary)
            .GroupBy(chunk => chunk.Chunk.Id)
            .Select(group => group.OrderByDescending(item => item.Score).First())
            .OrderByDescending(item => item.Score)
            .Take(topK)
            .ToList();
    }

    private static string AppendSources(
        string answer,
        IReadOnlyList<string> sourceTitles,
        IReadOnlyList<Guid> allSourceIds,
        string publicBaseUrl
    )
    {
        if (sourceTitles.Count == 0)
        {
            return answer;
        }

        // Mapeia titulo → id (pega o primeiro id encontrado para cada titulo)
        var titleToId = allSourceIds
            .Select((id, i) => (Id: id, Title: sourceTitles.ElementAtOrDefault(i)))
            .Where(x => x.Title is not null)
            .GroupBy(x => x.Title)
            .ToDictionary(g => g.Key!, g => g.First().Id);

        var sb = new StringBuilder(answer.TrimEnd());
        sb.AppendLine();
        sb.AppendLine();
        sb.AppendLine("Fontes consultadas:");
        foreach (var title in sourceTitles)
        {
            var url = titleToId.TryGetValue(title, out var id)
                ? $"{publicBaseUrl.TrimEnd('/')}/knowledge/documents/{id}"
                : null;
            if (url is not null)
            {
                sb.AppendLine($"• <{url}|{title}>");
            }
            else
            {
                sb.AppendLine($"• {title}");
            }
        }

        return sb.ToString().TrimEnd();
    }

    [GeneratedRegex(@"(?:^|\n)SOURCES_USED:\s*(.*)", RegexOptions.IgnoreCase)]
    private static partial Regex SourcesUsedRegex();

    [GeneratedRegex(@"[\*_#>\s]*Fontes\s+consultadas\s*:?", RegexOptions.IgnoreCase)]
    private static partial Regex FontesConsultadasRegex();
}
