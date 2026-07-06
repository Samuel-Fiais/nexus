# Tasks de Implementação — MVP Robô de Dúvidas no Slack

> Baseado em `regras_negocio_slack_rag_bot.md`, com as seguintes decisões de arquitetura adicionais definidas em conversa:
> - Provider de LLM agnóstico via flag de ambiente (`LLM_PROVIDER`), implementando apenas **DeepSeek** agora.
> - Banco relacional: **SQLite** agora, com caminho de migração para **Postgres** depois (via EF Core + Repository/Unit of Work) — ver `docs/postgres-migration.md`.
> - Fonte de conhecimento agnóstica via interface comum (`IKnowledgeSourceProvider`), implementando apenas **Local Folder** agora (Notion/Google Drive/Azure Storage depois, atrás da mesma interface) — ver `docs/extension-points.md`.
> - Tipos de conteúdo no MVP: **Markdown** e **Website Link** (extraído via **Tavily web_extract**).
> - **Sistema de Tags**: tags geradas automaticamente por LLM durante a ingestão, livres (sem taxonomia fixa), usadas como pré-filtro de busca com fallback para busca vetorial completa — ver `docs/tags-taxonomy.md`.
>
> ⚠️ **Segredos**: as chaves de API do DeepSeek e da Tavily fornecidas na conversa NÃO devem ser commitadas em nenhum arquivo do repositório. Devem existir apenas em `.env` (local, git-ignored) ou em um cofre de segredos (ex.: Azure Key Vault, User Secrets do .NET). Recomenda-se rotacionar essas duas chaves, já que foram compartilhadas em texto puro no chat.

---

## Épico 0 — Setup do Projeto

- [x] 0.1 Criar solution .NET 8. *(Estrutura atual: `Nexus.Domain`, `Nexus.Application`, `Nexus.Llm.Abstractions/.DeepSeek/.Llm`, `Nexus.KnowledgeSources.Abstractions/.LocalFolder/.Tavily/.KnowledgeSources`, `Nexus.Slack`, `Nexus.Persistence`, `Nexus.Api`, `Nexus.Worker`.)*
- [x] 0.2 EF Core com SQLite (`Nexus.Persistence`), `DbContext` isolado dos demais módulos.
- [x] 0.3 `appsettings.json` + variáveis de ambiente para `Llm__Provider`, `DeepSeek__ApiKey`, `Tavily__ApiKey`, `Slack__SigningSecret`/`Slack__BotToken`/`Slack__AllowedTeamId`, `Admin__ApiKey`, `Knowledge:LocalFolderPath` e timezone via `App:Timezone` (env var `App__Timezone`, default `America/Sao_Paulo`, lido pelo `QuotaService`).
- [x] 0.4 Logging estruturado — Serilog com sinks de console e arquivo rolante (`logs/nexus-api-.log` / `logs/nexus-worker-.log`), `Enrich.FromLogContext()`; `QuestionOrchestrator` loga com `slack_user_id`/`interaction_id`/`model`/`tokens_used` como campos estruturados (ver 10.2).
- [x] 0.5 Migrations do EF Core configuradas via `dotnet-ef` (local tool); comando: `dotnet dotnet-ef migrations add <Nome> --project src/Nexus.Persistence --startup-project src/Nexus.Api -o Migrations`.
- [x] 0.6 `.gitignore` criado (bin/obj, `.env`, `*.db`, `logs/`, `knowledge/`, segredos locais). *(O repositório git em si ainda não foi inicializado — rodar `git init` quando desejar versionar.)*

---

## Épico 1 — Domínio e Modelagem de Dados

Baseado na seção 10 do documento de regras, com a adição do sistema de tags.

- [x] 1.1 Entidade `User`.
- [x] 1.2 Entidade `UserDailyUsage`, constraint única `(user_id, date)`.
- [x] 1.3 Entidade `KnowledgeSource`.
- [x] 1.4 Entidade `Document`.
- [x] 1.5 Entidade `DocumentChunk` (`Embedding` como `byte[]`, populado na ingestão — ver 6.6).
- [x] 1.6 Entidade `Interaction` (`SourcesJson`/`TagsMatchedJson` populados pelo orchestrator — ver 7.5/8.3).
- [x] 1.7 Entidade `Tag`.
- [x] 1.8 Entidade `DocumentTag`.
- [x] 1.9 Migration inicial (`InitialCreate`) cobrindo todas as entidades acima, incluindo `Tag`/`DocumentTag`.
- [x] 1.10 Seeds mínimos para desenvolvimento local — `DevelopmentSeeder` (executado pelo `Nexus.Api` em ambiente Development) cria uma `KnowledgeSource` LocalFolder apontando para `Knowledge:LocalFolderPath` e um markdown de exemplo quando a pasta não existe.

---

## Épico 2 — Integração com Slack

- [x] 2.1 Endpoint `POST /slack/events`, com suporte ao `url_verification`.
- [x] 2.2 Validação de assinatura Slack (`SlackSignatureValidator`: HMAC-SHA256 + rejeição de timestamp expirado).
- [x] 2.3 Parsing de eventos `message`/`app_mention` (ignora eventos de outros tipos e mensagens do próprio bot).
- [x] 2.4 Idempotência via `SlackEventId` único (`Interaction`) + checagem prévia no `QuestionOrchestrator`.
- [x] 2.5 Resolve/cria `User` por `slack_user_id`, com autorização por workspace via `Slack__AllowedTeamId` (ver 9.1).
- [x] 2.6 `ISlackNotifier.PostMessageAsync` respeitando canal/thread.
- [x] 2.7 Mensagens sem usuário/texto/event_id válidos retornam 200 sem acionar o orchestrator (não consomem cota).

---

## Épico 3 — Controle de Cota Diária

- [x] 3.1 `IQuotaService` com `HasQuotaAvailableAsync`, `ConsumeQuotaAsync`, `GetRemainingQuotaAsync`, `DailyLimit = 10`.
- [x] 3.2 Cálculo de "hoje" via `IClock.TodayInTimezone`, com fallback para UTC-3 se a timezone não existir no SO. Timezone lida de `App:Timezone` (default `America/Sao_Paulo`).
- [x] 3.3 Cota só é consumida depois de assinatura válida + usuário resolvido + resposta gerada (`QuestionOrchestrator`).
- [x] 3.4 Mensagem de limite excedido implementada, sem consumo adicional de cota.
- [x] 3.5 Retenção/expurgo de `UserDailyUsage` antigo — `RetentionWorker` (Nexus.Worker) expurga diariamente registros com mais de `Retention:UserDailyUsageDays` dias (default 90).

---

## Épico 4 — Provider de LLM Agnóstico

- [x] 4.1 `ILlmProvider.GenerateAnswerAsync` + `LlmResult` (`Nexus.Llm.Abstractions`).
- [x] 4.2 `DeepSeekLlmProvider` (`Nexus.Llm.DeepSeek`), API key só via `DeepSeek__ApiKey`/config, nunca hardcoded.
- [x] 4.3 Seleção de provider por `Llm:Provider` em `Nexus.Llm` (`AddLlmProviders`), lança exceção clara se o valor não for suportado.
- [x] 4.4 Erros do provider são capturados no `QuestionOrchestrator`, gravando `Interaction` com `Status = Error` e devolvendo mensagem genérica ao usuário.
- [x] 4.5 Ponto de extensão materializado pela própria separação de projetos; passos documentados em `docs/extension-points.md`.

---

## Épico 5 — Fonte de Conhecimento Agnóstica (Knowledge Source)

- [x] 5.1 `IKnowledgeSourceProvider` + `SourceItem` (`Nexus.KnowledgeSources.Abstractions`).
- [x] 5.2 `LocalFolderKnowledgeSourceProvider` varrendo a pasta da fonte: `.md` → Markdown; `.url`/`.link` (arquivo contendo a URL) → WebsiteLink extraído via Tavily (6.3).
- [x] 5.3 `KnowledgeSourceProviderFactory` (`Nexus.KnowledgeSources`) resolvendo por `KnowledgeSourceType` (hoje só `LocalFolder`).
- [x] 5.4 CRUD administrativo de `KnowledgeSource` — `GET/POST/PUT /admin/knowledge-sources` (`AdminController`, protegido por `X-Admin-Api-Key`).

---

## Épico 6 — Ingestão e Indexação de Conteúdo

- [x] 6.1 `SyncWorker` (`Nexus.Worker`, `BackgroundService` a cada `Sync:IntervalMinutes`) processando cada `KnowledgeSource` ativa; a indexação em si vive em `DocumentIngestionService` (`Nexus.Application/Ingestion`), testável e reutilizável.
- [x] 6.2 Handler markdown (leitura direta do arquivo).
- [x] 6.3 Handler `website_link` via Tavily `web_extract` — `Nexus.KnowledgeSources.Tavily` (`IWebContentExtractor`), chave via `Tavily__ApiKey`; falha em um item não interrompe o ciclo da fonte.
- [x] 6.4 Hash SHA-256 do conteúdo (`ContentHasher`), pulando reindexação se inalterado (reindexa se houver chunks sem embedding, para upgrade de bases antigas).
- [x] 6.5 Chunking por tamanho fixo (`ContentChunker`, 1500 chars, overlap de 200).
- [x] 6.6 Geração de embeddings — `HashingEmbeddingProvider` (feature hashing local/determinístico, 512 dims, normalização L2, sem API externa); persistidos em `DocumentChunk.Embedding`. Troca por provedor semântico externo documentada em `docs/extension-points.md` (exige reindexação).
- [x] 6.7 Busca vetorial — `VectorChunkSearchService` ranqueia por similaridade de cosseno com score mínimo de relevância; caminho para pgvector documentado em `docs/postgres-migration.md`.
- [x] 6.8 Persistência de `Document` + `DocumentChunk`s (`ReplaceChunksAsync`).
- [x] 6.9 Auto-tagging via LLM — `LlmTagGenerationService` (prompt curto, resposta JSON array, 3–8 tags kebab-case; falha degrada para lista vazia sem quebrar a ingestão).
- [x] 6.10 Persistência de `Tag`/`DocumentTag` — `TagRepository.ReplaceDocumentTagsAsync` (upsert de tag por slug + substituição dos vínculos).
- [x] 6.11 Regeneração de tags ao reindexar (tags anteriores preservadas se a geração falhar).
- [x] 6.12 `last_sync_at` da `KnowledgeSource` atualizado ao final do ciclo de cada fonte.
- [x] 6.13 Busca filtra documentos não indexados e fontes inativas (`VectorChunkSearchService` + `TagBasedRetriever`).

---

## Épico 7 — Sistema de Tags no Fluxo de Busca

- [x] 7.1 `ITagExtractionService` — decisão de custo/benefício: matching determinístico dos tokens da pergunta (normalizados, sem acento) contra as tags existentes, sem chamada extra de LLM por pergunta (latência dentro dos 3s do Slack, custo zero). Um extrator via LLM leve pode substituir a implementação atrás da mesma interface.
- [x] 7.2 `ITagBasedRetriever` — documentos por tags via `DocumentTag`, apenas documentos indexados de fontes ativas.
- [x] 7.3 Pré-filtro no fluxo de RAG: quando há documentos casados por tag, a busca vetorial fica restrita a eles.
- [x] 7.4 Fallback: sem tags casadas, ou busca restrita sem chunks acima do score mínimo → busca vetorial completa.
- [x] 7.5 `Interaction.TagsMatchedJson` registra as tags casadas na pergunta (auditoria/tunagem).
- [x] 7.6 `GET /admin/tags` lista as tags com a contagem de documentos coberta por cada uma.

---

## Épico 8 — Orquestração do Fluxo de Resposta (RAG)

- [x] 8.1 `QuestionOrchestrator.HandleQuestionAsync` fim a fim: idempotência → resolve/cria usuário → checa cota → extração de tags → pré-filtro por tags → embedding → busca vetorial (com fallback) → prompt → LLM → persiste `Interaction` (com fontes e tags) → consome cota.
- [x] 8.2 Prompt base do sistema cobrindo as regras: só contexto, não inventar, indicar insuficiência, citar fontes, linguagem corporativa.
- [x] 8.3 Citação formatada de fontes — prompt instrui `Segundo o documento "X"...`, chunks são apresentados com título do documento, e a resposta final recebe a lista "Fontes consultadas"; títulos persistidos em `Interaction.SourcesJson`.
- [x] 8.4 Timeout explícito (`App:LlmTimeoutSeconds`, default 60s) ao redor de busca + LLM via `CancellationTokenSource` vinculado; timeout gera `Interaction` de erro e mensagem amigável.

---

## Épico 9 — Segurança e Autorização

- [x] 9.1 Autorização por workspace: `Slack__AllowedTeamId` — quando definido, eventos de outros `team_id` são ignorados. **Obrigatório configurar antes de expor o bot fora de ambiente controlado** (sem o valor, qualquer workspace que passe na assinatura é aceito e o usuário é criado automaticamente).
- [x] 9.2 Busca não retorna chunks de fontes desativadas/documentos não indexados (mesmo item de 6.13).
- [x] 9.3 Segredos geridos só via variáveis de ambiente (`DeepSeek__ApiKey`, `Tavily__ApiKey`, `Slack__SigningSecret`, `Slack__BotToken`, `Admin__ApiKey`); `appsettings.json` só tem comentários instruindo isso, sem valores reais.
- [ ] 9.4 Rotação das chaves de DeepSeek/Tavily compartilhadas em texto puro no chat — **ação manual do usuário, ainda pendente**.

---

## Épico 10 — Logs e Auditoria

- [x] 10.1 `Interaction` persistida por requisição, incluindo `SourcesJson`/`TagsMatchedJson`.
- [x] 10.2 Logging estruturado por etapa no `QuestionOrchestrator` com `BeginScope` (`slack_user_id`, `slack_event_id`) e campos `interaction_id`/`status`/`model`/`tokens_used`; Serilog com `Enrich.FromLogContext()` e sink de arquivo.
- [x] 10.3 `GET /admin/interactions` — paginação, filtros por `slackUserId` e `date`.
- [x] 10.4 `GET /admin/usage` — uso (requests/tokens) por usuário e dia.

---

## Épico 11 — Testes

`dotnet test`: **40 testes verdes**.

- [x] 11.1 Unitários: `QuotaService`, `ContentChunker` (chunking/overlap/reconstrução), `ContentHasher` (vetor de teste SHA-256), `HashingEmbeddingProvider` (determinismo, normalização, similaridade, acentos, roundtrip de serialização), `TagExtractionService` (matching com acentos, tags multi-palavra).
- [x] 11.2 Integração de ingestão de Markdown fim a fim (`DocumentIngestionIntegrationTests`): pasta local real + provider LocalFolder + repositórios EF sobre SQLite in-memory + embeddings reais; cobre skip por hash, reindexação com regeneração de tags e arquivos `.link`.
- [x] 11.3 Integração de ingestão de website com Tavily mockado em nível de HTTP (`TavilyWebContentExtractorTests`).
- [x] 11.4 Assinatura Slack: unidade (`SlackSignatureValidatorTests`) + integração via `POST /slack/events` com `WebApplicationFactory` (`SlackEventsIntegrationTests`: challenge, 401 para assinatura inválida).
- [x] 11.5 Idempotência de eventos Slack duplicados: em unidade (`QuestionOrchestratorTests`) e via HTTP (evento duplicado → uma única `Interaction`).
- [x] 11.6 Fluxo de pergunta completo com LLM mockado (`QuestionOrchestratorTests`): sucesso com fontes/consumo de cota, cota excedida, fallback do pré-filtro de tags, erro do provider, contexto insuficiente.
- [x] 11.7 Busca vetorial (`VectorChunkSearchServiceTests`): ranking por relevância, exclusão de fontes inativas/documentos pendentes, restrição por documento.

---

## Épico 12 — Preparação para Evolução Futura (fora do MVP, apenas manter caminho aberto)

- [x] 12.1 Checklist de migração SQLite → Postgres — `docs/postgres-migration.md` (provider EF, migrations, tipos `jsonb`, pgvector).
- [x] 12.2 Pontos de extensão para novos `IKnowledgeSourceProvider`, `ILlmProvider`, `IEmbeddingProvider` e `ITagExtractionService` — `docs/extension-points.md`.
- [x] 12.3 Taxonomia opcional de tags — `docs/tags-taxonomy.md`.

---

## Status Geral

**Fase 1 (MVP mínimo funcional)** — ✅ concluída.

**Fase 2 (website link + Tavily, tags, endpoints administrativos)** — ✅ concluída: Épico 6 completo, Épico 7 completo, CRUD de fontes + consultas administrativas (`/admin/*`, header `X-Admin-Api-Key`).

**Fase 3 (testes abrangentes, docs de evolução)** — ✅ concluída: 40 testes verdes (unidade + integração de ingestão + integração HTTP do endpoint Slack), docs do Épico 12.

**Pendências operacionais (fora do código):**
1. Rotacionar as chaves DeepSeek/Tavily compartilhadas no chat (9.4) e configurá-las só via env vars/user-secrets.
2. Definir `Slack__AllowedTeamId` e `Admin__ApiKey` antes de expor a API.
3. `git init` + primeiro commit (o `.gitignore` já está pronto).
4. Reindexação manual via endpoint e métricas de uso agregadas seguem como ideias futuras (não fazem parte dos épicos originais concluídos).
