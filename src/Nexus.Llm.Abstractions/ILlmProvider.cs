namespace Nexus.Llm.Abstractions;

public interface ILlmProvider
{
    Task<LlmResult> GenerateAnswerAsync(
        string systemPrompt,
        string userPrompt,
        CancellationToken ct
    );
}
