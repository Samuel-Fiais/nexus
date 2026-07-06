namespace Nexus.Llm;

public class LlmOptions
{
    /// <summary>
    /// Provedor de LLM ativo. Somente "deepseek" e suportado na Fase 1.
    /// </summary>
    public string Provider { get; set; } = "deepseek";
}
