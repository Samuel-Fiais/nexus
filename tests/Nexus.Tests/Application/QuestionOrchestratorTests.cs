using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Nexus.Application;
using Nexus.Application.Abstractions;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Application.UseCases;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Llm.Abstractions;

namespace Nexus.Tests.Application;

/// <summary>
/// Task 11.6: fluxo de pergunta completo com LLM mockado, incluindo idempotencia,
/// cota excedida, fallback do pre-filtro de tags e tratamento de erro do provider.
/// </summary>
public class QuestionOrchestratorTests
{
    private class FakeClock : IClock
    {
        public DateTimeOffset UtcNow => new(2026, 7, 4, 12, 0, 0, TimeSpan.Zero);

        public DateOnly TodayInTimezone(string timezoneId) => new(2026, 7, 4);
    }

    private class FakeUserRepository : IUserRepository
    {
        public List<User> Users { get; } = [];

        public Task<User?> GetByIdAsync(Guid id, CancellationToken ct) =>
            Task.FromResult(Users.FirstOrDefault(u => u.Id == id));

        public Task<User?> GetBySlackUserIdAsync(string slackUserId, CancellationToken ct) =>
            Task.FromResult(Users.FirstOrDefault(u => u.SlackUserId == slackUserId));

        public Task AddAsync(User user, CancellationToken ct)
        {
            Users.Add(user);
            return Task.CompletedTask;
        }

        public Task UpdateAsync(User user, CancellationToken ct) => Task.CompletedTask;
    }

    private class FakeInteractionRepository : IInteractionRepository
    {
        public List<Interaction> Interactions { get; } = [];

        public Task<Interaction?> GetBySlackEventIdAsync(string slackEventId, CancellationToken ct) =>
            Task.FromResult(Interactions.FirstOrDefault(i => i.SlackEventId == slackEventId));

        public Task<IReadOnlyList<Interaction>> GetByConversationSessionWindowAsync(
            Guid conversationSessionId,
            int sessionWindowNumber,
            CancellationToken ct
        ) =>
            Task.FromResult<IReadOnlyList<Interaction>>(
                Interactions
                    .Where(i =>
                        i.ConversationSessionId == conversationSessionId
                        && i.SessionWindowNumber == sessionWindowNumber
                    )
                    .OrderBy(i => i.CreatedAt)
                    .ToList()
            );

        public Task AddAsync(Interaction interaction, CancellationToken ct)
        {
            Interactions.Add(interaction);
            return Task.CompletedTask;
        }
    }

    private class FakeConversationSessionRepository : IConversationSessionRepository
    {
        public List<ConversationSession> Sessions { get; } = [];

        public Task<ConversationSession?> GetBySessionKeyAsync(string sessionKey, CancellationToken ct) =>
            Task.FromResult(Sessions.FirstOrDefault(s => s.SessionKey == sessionKey));

        public Task AddAsync(ConversationSession session, CancellationToken ct)
        {
            Sessions.Add(session);
            return Task.CompletedTask;
        }

        public Task UpdateAsync(ConversationSession session, CancellationToken ct)
        {
            var index = Sessions.FindIndex(s => s.Id == session.Id);
            if (index >= 0)
            {
                Sessions[index] = session;
            }

            return Task.CompletedTask;
        }
    }

    private class FakeDocumentRepository : IDocumentRepository
    {
        public List<Document> Documents { get; } = [];

        public Task<Document?> GetByIdAsync(Guid id, CancellationToken ct) =>
            Task.FromResult(Documents.FirstOrDefault(d => d.Id == id));

        public Task<Document?> GetBySourceAndExternalIdAsync(
            Guid sourceId,
            string externalId,
            CancellationToken ct
        ) => Task.FromResult(Documents.FirstOrDefault(d => d.SourceId == sourceId && d.ExternalId == externalId));

        public Task<IReadOnlyList<Document>> GetByTitlesAsync(
            IReadOnlyCollection<string> titles,
            CancellationToken ct
        ) =>
            Task.FromResult<IReadOnlyList<Document>>(Documents.Where(d => titles.Contains(d.Title)).ToList());

        public Task<IReadOnlyList<Document>> SearchByTitleTermsAsync(
            IReadOnlyCollection<string> terms,
            CancellationToken ct
        )
        {
            var normalizedTerms = terms
                .Select(Normalize)
                .Where(term => !string.IsNullOrWhiteSpace(term))
                .Distinct()
                .ToList();

            return Task.FromResult<IReadOnlyList<Document>>(
                Documents
                    .Where(document =>
                    {
                        var normalizedTitle = Normalize(document.Title);
                        return normalizedTerms.Any(term => normalizedTitle.Contains(term));
                    })
                    .ToList()
            );
        }

        public Task AddAsync(Document document, CancellationToken ct)
        {
            Documents.Add(document);
            return Task.CompletedTask;
        }

        public Task UpdateAsync(Document document, CancellationToken ct) => Task.CompletedTask;

        private static string Normalize(string value)
        {
            var chars = value.ToLowerInvariant().Where(char.IsLetterOrDigit).ToArray();
            return new string(chars);
        }
    }

    private class FakeQuotaService(bool hasQuota = true) : IQuotaService
    {
        public int ConsumeCalls { get; private set; }

        public Task<bool> HasQuotaAvailableAsync(Guid userId, CancellationToken ct) =>
            Task.FromResult(hasQuota);

        public Task ConsumeQuotaAsync(Guid userId, int tokensUsed, CancellationToken ct)
        {
            ConsumeCalls++;
            return Task.CompletedTask;
        }

        public Task<int> GetRemainingQuotaAsync(Guid userId, CancellationToken ct) =>
            Task.FromResult(hasQuota ? 1 : 0);
    }

    private class FakeLlmProvider : ILlmProvider
    {
        public int Calls { get; private set; }
        public Exception? ThrowOnCall { get; set; }
        public string Answer { get; set; } = "Resposta gerada.";
        public string CompactionAnswer { get; set; } = "Resumo compactado.";
        public List<string> UserPrompts { get; } = [];
        public Queue<string>? AnswerSequence { get; set; }

        public Task<LlmResult> GenerateAnswerAsync(
            string systemPrompt,
            string userPrompt,
            CancellationToken ct
        )
        {
            Calls++;
            UserPrompts.Add(userPrompt);
            if (ThrowOnCall is not null)
            {
                throw ThrowOnCall;
            }

            var answer =
                systemPrompt.Contains("compactador de histórico", StringComparison.OrdinalIgnoreCase)
                    ? CompactionAnswer
                    : AnswerSequence is { Count: > 0 }
                        ? AnswerSequence.Dequeue()
                        : Answer;

            return Task.FromResult(new LlmResult(answer, 100, 50, "fake-model"));
        }
    }

    private class FakeEmbeddingProvider : IEmbeddingProvider
    {
        public Task<float[]> GenerateEmbeddingAsync(string text, CancellationToken ct) =>
            Task.FromResult(new float[] { 1f, 0f });
    }

    private class FakeChunkSearchService(
        IReadOnlyList<ChunkSearchResult> restrictedResults,
        IReadOnlyList<ChunkSearchResult> fullResults
    ) : IChunkSearchService
    {
        public List<IReadOnlyCollection<Guid>?> CallsRestrictions { get; } = [];

        public Task<IReadOnlyList<ChunkSearchResult>> SearchAsync(
            float[] questionEmbedding,
            int topK,
            IReadOnlyCollection<Guid>? restrictToDocumentIds,
            CancellationToken ct,
            bool enforceMinScore = true
        )
        {
            CallsRestrictions.Add(restrictToDocumentIds);
            return Task.FromResult(
                restrictToDocumentIds is null ? fullResults : restrictedResults
            );
        }
    }

    private class FakeTagExtractionService(IReadOnlyList<string> slugs) : ITagExtractionService
    {
        public Task<IReadOnlyList<string>> ExtractMatchingTagSlugsAsync(
            string question,
            CancellationToken ct
        ) => Task.FromResult(slugs);
    }

    private class FakeTagBasedRetriever(IReadOnlyList<Guid> documentIds) : ITagBasedRetriever
    {
        public Task<IReadOnlyList<Guid>> GetDocumentIdsByTagSlugsAsync(
            IReadOnlyCollection<string> tagSlugs,
            CancellationToken ct
        ) => Task.FromResult(documentIds);
    }

    private static ChunkSearchResult MakeChunk(string title, string content) =>
        new(
            new DocumentChunk
            {
                Id = Guid.NewGuid(),
                DocumentId = Guid.NewGuid(),
                ChunkIndex = 0,
                Content = content,
                CreatedAt = DateTimeOffset.UtcNow,
            },
            title,
            0.9
        );

    private static SlackQuestionRequest MakeRequest(string eventId = "Ev123") =>
        new("U123", "Fulano", "C123", null, eventId, "Como solicito ferias?");

    private static QuestionOrchestrator CreateOrchestrator(
        FakeUserRepository? users = null,
        FakeInteractionRepository? interactions = null,
        FakeConversationSessionRepository? sessions = null,
        FakeDocumentRepository? documents = null,
        FakeQuotaService? quota = null,
        FakeLlmProvider? llm = null,
        FakeChunkSearchService? search = null,
        FakeTagExtractionService? tagExtraction = null,
        FakeTagBasedRetriever? tagRetriever = null
    ) =>
        new(
            users ?? new FakeUserRepository(),
            interactions ?? new FakeInteractionRepository(),
            sessions ?? new FakeConversationSessionRepository(),
            documents ?? new FakeDocumentRepository(),
            quota ?? new FakeQuotaService(),
            llm ?? new FakeLlmProvider(),
            new FakeEmbeddingProvider(),
            search
                ?? new FakeChunkSearchService(
                    [MakeChunk("Politica de Ferias", "30 dias por ano")],
                    [MakeChunk("Politica de Ferias", "30 dias por ano")]
                ),
            tagExtraction ?? new FakeTagExtractionService([]),
            tagRetriever ?? new FakeTagBasedRetriever([]),
            new FakeClock(),
            Options.Create(new AppOptions()),
            NullLogger<QuestionOrchestrator>.Instance
        );

    [Fact]
    public async Task Success_Flow_Persists_Interaction_With_Sources_And_Consumes_Quota()
    {
        var interactions = new FakeInteractionRepository();
        var quota = new FakeQuotaService();
        var orchestrator = CreateOrchestrator(interactions: interactions, quota: quota);

        var result = await orchestrator.HandleQuestionAsync(MakeRequest(), CancellationToken.None);
        var answer = result.Answer;

        Assert.Contains("Resposta gerada.", answer);
        Assert.DoesNotContain("Fontes consultadas:", answer);
        Assert.True(result.ShouldNotifySlack);

        var interaction = Assert.Single(interactions.Interactions);
        Assert.Equal(InteractionStatus.Success, interaction.Status);
        Assert.Equal("fake-model", interaction.Model);
        Assert.Equal(150, interaction.TokensUsed);
        Assert.Null(interaction.SourcesJson);
        Assert.NotNull(interaction.ConversationSessionId);
        Assert.Equal(1, interaction.SessionWindowNumber);
        Assert.Equal(1, quota.ConsumeCalls);
    }

    [Fact]
    public async Task Duplicate_Slack_Event_Is_Idempotent()
    {
        var interactions = new FakeInteractionRepository();
        var llm = new FakeLlmProvider();
        var orchestrator = CreateOrchestrator(interactions: interactions, llm: llm);

        var first = await orchestrator.HandleQuestionAsync(MakeRequest(), CancellationToken.None);
        var second = await orchestrator.HandleQuestionAsync(MakeRequest(), CancellationToken.None);

        Assert.Equal(first.Answer, second.Answer);
        Assert.True(first.ShouldNotifySlack);
        Assert.False(second.ShouldNotifySlack);
        Assert.Single(interactions.Interactions);
        Assert.Equal(1, llm.Calls);
    }

    [Fact]
    public async Task Quota_Exceeded_Does_Not_Call_Llm()
    {
        var interactions = new FakeInteractionRepository();
        var llm = new FakeLlmProvider();
        var orchestrator = CreateOrchestrator(
            interactions: interactions,
            quota: new FakeQuotaService(hasQuota: false),
            llm: llm
        );

        var result = await orchestrator.HandleQuestionAsync(MakeRequest(), CancellationToken.None);
        var answer = result.Answer;

        Assert.Contains("limite diário", answer);
        Assert.True(result.ShouldNotifySlack);
        Assert.Equal(0, llm.Calls);
        var interaction = Assert.Single(interactions.Interactions);
        Assert.Equal(InteractionStatus.QuotaExceeded, interaction.Status);
    }

    [Fact]
    public async Task Tag_Prefilter_Falls_Back_To_Full_Search_When_Restricted_Search_Is_Empty()
    {
        var search = new FakeChunkSearchService(
            restrictedResults: [],
            fullResults: [MakeChunk("Doc Geral", "conteudo")]
        );
        var interactions = new FakeInteractionRepository();
        var orchestrator = CreateOrchestrator(
            interactions: interactions,
            search: search,
            tagExtraction: new FakeTagExtractionService(["ferias"]),
            tagRetriever: new FakeTagBasedRetriever([Guid.NewGuid()])
        );

        await orchestrator.HandleQuestionAsync(MakeRequest(), CancellationToken.None);

        // Primeira busca restrita por tags; segunda completa (fallback da regra 7.4).
        Assert.Equal(2, search.CallsRestrictions.Count);
        Assert.NotNull(search.CallsRestrictions[0]);
        Assert.Null(search.CallsRestrictions[1]);

        var interaction = Assert.Single(interactions.Interactions);
        Assert.Contains("ferias", interaction.TagsMatchedJson);
        Assert.Equal(InteractionStatus.Success, interaction.Status);
    }

    [Fact]
    public async Task Llm_Failure_Persists_Error_Interaction_And_Returns_Friendly_Message()
    {
        var interactions = new FakeInteractionRepository();
        var llm = new FakeLlmProvider { ThrowOnCall = new InvalidOperationException("boom") };
        var orchestrator = CreateOrchestrator(interactions: interactions, llm: llm);

        var result = await orchestrator.HandleQuestionAsync(MakeRequest(), CancellationToken.None);
        var answer = result.Answer;

        Assert.Contains("Ocorreu um erro", answer);
        Assert.True(result.ShouldNotifySlack);
        var interaction = Assert.Single(interactions.Interactions);
        Assert.Equal(InteractionStatus.Error, interaction.Status);
        Assert.Equal("boom", interaction.ErrorMessage);
    }

    [Fact]
    public async Task No_Context_Results_In_InsufficientContext_Status()
    {
        var search = new FakeChunkSearchService([], []);
        var interactions = new FakeInteractionRepository();
        var orchestrator = CreateOrchestrator(interactions: interactions, search: search);

        var result = await orchestrator.HandleQuestionAsync(MakeRequest(), CancellationToken.None);
        var answer = result.Answer;

        Assert.DoesNotContain("Fontes consultadas:", answer);
        Assert.True(result.ShouldNotifySlack);
        var interaction = Assert.Single(interactions.Interactions);
        Assert.Equal(InteractionStatus.InsufficientContext, interaction.Status);
        Assert.Null(interaction.SourcesJson);
    }

    [Fact]
    public async Task Success_Flow_Removes_Model_Generated_Sources_Section_Before_Appending_Own()
    {
        var interactions = new FakeInteractionRepository();
        var llm = new FakeLlmProvider
        {
            Answer =
                "A Festpay recebeu investimento.\n\nFontes consultadas:\n- Portal Fusões & Aquisições\n- Startupi\nSOURCES_USED: Politica de Ferias"
        };
        var orchestrator = CreateOrchestrator(interactions: interactions, llm: llm);

        var result = await orchestrator.HandleQuestionAsync(MakeRequest(), CancellationToken.None);

        Assert.Equal(1, CountOccurrences(result.Answer, "Fontes consultadas:"));
        Assert.DoesNotContain("Portal Fusões & Aquisições", result.Answer);
        Assert.Contains("Politica de Ferias", result.Answer);
    }

    [Fact]
    public async Task Success_Flow_Shows_Only_Sources_Explicitly_Marked_By_Model()
    {
        var interactions = new FakeInteractionRepository();
        var llm = new FakeLlmProvider
        {
            Answer =
                "A Festpay captou investimento para acelerar vendas.\nSOURCES_USED: festpay-startupi"
        };
        var search = new FakeChunkSearchService(
            restrictedResults: [],
            fullResults:
            [
                MakeChunk("festpay-pos-pago-google-play", "app de pagamentos"),
                MakeChunk("festpay-bett-brasil-2025", "cantina 2.0"),
                MakeChunk("festpay-startupi", "captação de R$ 1,8 milhão")
            ]
        );
        var orchestrator = CreateOrchestrator(interactions: interactions, llm: llm, search: search);

        var result = await orchestrator.HandleQuestionAsync(MakeRequest(), CancellationToken.None);

        Assert.Contains("Fontes consultadas:", result.Answer);
        Assert.Contains("festpay-startupi", result.Answer);
        Assert.DoesNotContain("festpay-pos-pago-google-play", result.Answer);
        Assert.DoesNotContain("festpay-bett-brasil-2025", result.Answer);
    }

    [Fact]
    public async Task Retries_When_Context_Exists_But_First_Answer_Says_No_Information()
    {
        var interactions = new FakeInteractionRepository();
        var llm = new FakeLlmProvider
        {
            AnswerSequence =
                new Queue<string>(
                    [
                        "Não há informação disponível na base de conhecimento sobre isso.",
                        "Sim, a Festpay captou R$ 1,8 milhão.\nSOURCES_USED: festpay-startupi",
                    ]
                )
        };
        llm.CompactionAnswer = "Resumo compactado.";
        var search = new FakeChunkSearchService(
            restrictedResults: [],
            fullResults: [MakeChunk("festpay-startupi", "A Festpay captou R$ 1,8 milhão.")]
        );
        var orchestrator = CreateOrchestrator(interactions: interactions, llm: llm, search: search);

        var result = await orchestrator.HandleQuestionAsync(MakeRequest(), CancellationToken.None);

        Assert.True(llm.UserPrompts.Count >= 2);
        Assert.Contains("ATENCAO:", llm.UserPrompts.Last());
        Assert.Contains("Sim, a Festpay captou R$ 1,8 milhão.", result.Answer);
        Assert.Contains("festpay-startupi", result.Answer);
    }

    [Fact]
    public async Task Retries_With_Broader_Search_When_Tag_Filter_Context_Leads_To_No_Info()
    {
        var interactions = new FakeInteractionRepository();
        var documents = new FakeDocumentRepository();
        var llm = new FakeLlmProvider
        {
            AnswerSequence =
                new Queue<string>(
                    [
                        "Não há informações na base de conhecimento sobre investimentos recebidos pela Festpay.",
                        "Sim, a Festpay captou R$ 1,8 milhão.\nSOURCES_USED: festpay-startupi",
                    ]
                )
        };
        var restrictedDocId = Guid.NewGuid();
        var search = new FakeChunkSearchService(
            restrictedResults:
            [
                new ChunkSearchResult(
                    new DocumentChunk
                    {
                        Id = Guid.NewGuid(),
                        DocumentId = restrictedDocId,
                        ChunkIndex = 0,
                        Content = "A Festpay atua com pagamentos para cantinas escolares.",
                        CreatedAt = DateTimeOffset.UtcNow,
                    },
                    "captacao",
                    0.82
                )
            ],
            fullResults:
            [
                new ChunkSearchResult(
                    new DocumentChunk
                    {
                        Id = Guid.NewGuid(),
                        DocumentId = Guid.NewGuid(),
                        ChunkIndex = 0,
                        Content = "A Festpay captou R$ 1,8 milhão para digitalizar a gestão financeira de cantinas escolares.",
                        CreatedAt = DateTimeOffset.UtcNow,
                    },
                    "festpay-startupi",
                    0.97
                )
            ]
        );
        documents.Documents.Add(
            new Document
            {
                Id = Guid.NewGuid(),
                Title = "festpay-visao-geral",
                SourceId = Guid.NewGuid(),
                ExternalId = "empresa/festpay-visao-geral.md",
                Status = DocumentStatus.Indexed,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
            }
        );
        documents.Documents.Add(
            new Document
            {
                Id = Guid.NewGuid(),
                Title = "festpay-startupi",
                SourceId = Guid.NewGuid(),
                ExternalId = "referencias/festpay-startupi.url",
                Status = DocumentStatus.Indexed,
                CreatedAt = DateTimeOffset.UtcNow,
                UpdatedAt = DateTimeOffset.UtcNow,
            }
        );
        var orchestrator = CreateOrchestrator(
            interactions: interactions,
            documents: documents,
            llm: llm,
            search: search,
            tagExtraction: new FakeTagExtractionService(["festpay", "investimento"]),
            tagRetriever: new FakeTagBasedRetriever([restrictedDocId])
        );

        var result = await orchestrator.HandleQuestionAsync(MakeRequest(), CancellationToken.None);

        Assert.Equal(2, llm.Calls);
        Assert.Equal(2, search.CallsRestrictions.Count);
        Assert.NotNull(search.CallsRestrictions[0]);
        Assert.Null(search.CallsRestrictions[1]);
        Assert.Contains("festpay-startupi", llm.UserPrompts.Last());
        Assert.Contains("Sim, a Festpay captou R$ 1,8 milhão.", result.Answer);
        Assert.Contains("festpay-startupi", result.Answer);
    }

    [Fact]
    public async Task Session_Is_Compacted_After_Ten_Messages_And_Renews_With_Summary()
    {
        var interactions = new FakeInteractionRepository();
        var sessions = new FakeConversationSessionRepository();
        var llm = new FakeLlmProvider
        {
            Answer = "Resposta gerada.",
            CompactionAnswer = "Resumo da sessão anterior."
        };
        var orchestrator = CreateOrchestrator(interactions: interactions, sessions: sessions, llm: llm);

        for (var i = 1; i <= 10; i++)
        {
            await orchestrator.HandleQuestionAsync(MakeRequest($"Ev{i}"), CancellationToken.None);
        }

        var session = Assert.Single(sessions.Sessions);
        Assert.Equal(2, session.CurrentWindowNumber);
        Assert.Equal(0, session.MessageCountInWindow);
        Assert.Equal(10, session.TotalMessageCount);
        Assert.Equal("Resumo da sessão anterior.", session.Summary);

        await orchestrator.HandleQuestionAsync(MakeRequest("Ev11"), CancellationToken.None);

        Assert.Contains("Resumo da sessão anterior.", llm.UserPrompts.Last());
        Assert.Contains("HISTORICO DA SESSAO:", llm.UserPrompts.Last());
    }

    private static int CountOccurrences(string text, string value) =>
        text.Split(value).Length - 1;
}
