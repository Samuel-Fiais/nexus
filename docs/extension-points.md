# Pontos de extensão (task 12.2)

## Novo provedor de LLM (ex.: OpenAI, Anthropic)

1. Criar projeto `Nexus.Llm.<Provider>` referenciando `Nexus.Llm.Abstractions`.
2. Implementar `ILlmProvider.GenerateAnswerAsync` (ver `Nexus.Llm.DeepSeek/DeepSeekLlmProvider.cs`
   como modelo: options próprias, `IHttpClientFactory`, API key só via configuração).
3. Criar `ServiceCollectionExtensions.Add<Provider>Provider(IConfiguration)` no novo projeto.
4. Registrar no switch de `Nexus.Llm/DependencyInjection/ServiceCollectionExtensions.cs`
   (chave = valor de `Llm:Provider` / env var `Llm__Provider`).

O mesmo `ILlmProvider` é usado para responder perguntas e para o auto-tagging da ingestão.

## Nova fonte de conhecimento (ex.: Notion, Google Drive, Azure Storage)

1. Adicionar o valor ao enum `Nexus.Domain/Enums/KnowledgeSourceType.cs`.
2. Criar projeto `Nexus.KnowledgeSources.<Provider>` referenciando
   `Nexus.KnowledgeSources.Abstractions` e implementar `IKnowledgeSourceProvider`
   (`ListItemsAsync` + `ReadContentAsync`; `KnowledgeSource.UrlOrPath`/`MetadataJson` carregam a
   configuração específica da fonte).
3. Registrar o provider no DI (`Nexus.KnowledgeSources/DependencyInjection`) e mapeá-lo no
   `KnowledgeSourceProviderFactory`.
4. Cadastrar a fonte via `POST /admin/knowledge-sources`.

Para novos tipos de conteúdo web, há também `IWebContentExtractor` (implementação atual:
`Nexus.KnowledgeSources.Tavily`), usado pelos arquivos `.url`/`.link` do provider LocalFolder.

## Novo provedor de embeddings

1. Implementar `IEmbeddingProvider` (hoje: `HashingEmbeddingProvider`, local/deterministico,
   512 dimensões) em um projeto próprio ou em `Nexus.Application/Embeddings`.
2. Trocar o registro em `Nexus.Application/DependencyInjection/ServiceCollectionExtensions.cs`.
3. **Importante**: embeddings de provedores diferentes não são comparáveis entre si. Após a troca,
   force a reindexação (apagar `DocumentChunks` ou alterar o `ContentHash` dos documentos) para
   que pergunta e chunks usem o mesmo espaço vetorial.

## Extração de tags da pergunta

`ITagExtractionService` hoje usa matching determinístico (tokens da pergunta × tags existentes),
sem custo extra de LLM por pergunta. Para trocar por um extrator via LLM leve, basta implementar
a interface e substituir o registro no DI — o orquestrador e o fallback (regra 7.4) não mudam.
