namespace Nexus.Application;

/// <summary>
/// Opcoes gerais da aplicacao (secao "App" do appsettings / env vars App__*).
/// </summary>
public class AppOptions
{
    /// <summary>
    /// Timezone usada para o reset diario de cota (env var App__Timezone).
    /// </summary>
    public string Timezone { get; set; } = "America/Sao_Paulo";

    /// <summary>
    /// Timeout, em segundos, aplicado ao redor da chamada de LLM + busca de contexto
    /// no fluxo de pergunta (regra 8.4).
    /// </summary>
    public int LlmTimeoutSeconds { get; set; } = 60;

    /// <summary>
    /// Quantidade maxima de mensagens mantidas na janela atual da sessao antes de compactar
    /// o historico e renovar a janela de conversa.
    /// </summary>
    public int SessionMessageWindowSize { get; set; } = 10;
}
