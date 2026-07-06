namespace Nexus.Llm.Abstractions;

public record LlmResult(
    string Answer,
    int? PromptTokens,
    int? CompletionTokens,
    string Model,
    int? CachedTokens = null,
    decimal? EstimatedCostUsd = null
);
