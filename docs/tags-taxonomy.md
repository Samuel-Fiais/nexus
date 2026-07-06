# Taxonomia opcional de tags (task 12.3)

## Estado atual (MVP): tags livres

- As tags são geradas automaticamente pelo LLM na ingestão (`LlmTagGenerationService`),
  sem vocabulário fixo: 3–8 tags por documento, minúsculas, kebab-case.
- A unicidade é garantida pelo slug normalizado (`TagSlug.From`: minúsculas, sem acentos,
  kebab-case) com índice único em `Tag.Slug`.
- Tags de um documento são regeneradas a cada reindexação; se a geração falhar, as tags
  anteriores são preservadas.
- `GET /admin/tags` lista as tags e quantos documentos cada uma cobre — use esse endpoint para
  monitorar dispersão do vocabulário (sinônimos, tags órfãs, tags boas demais/genéricas demais).

## Caminho para vocabulário controlado (futuro)

Se a base crescer e o vocabulário livre dispersar demais:

1. **Curadoria**: adicionar um campo `Approved`/`CanonicalTagId` em `Tag` para marcar tags
   oficiais e mapear sinônimos para a forma canônica (migração simples).
2. **Prompt fechado**: alterar o prompt do `LlmTagGenerationService` para escolher apenas dentre
   as tags aprovadas (enviar a lista no prompt), em vez de gerar livremente.
3. **Re-tagging**: forçar reindexação (ou apenas regeneração de tags) dos documentos existentes
   para convergir ao vocabulário controlado.
4. **Auditoria**: `Interaction.TagsMatchedJson` registra as tags casadas por pergunta — usar esses
   dados para decidir quais tags merecem entrar na taxonomia oficial (seção 15 das regras).
