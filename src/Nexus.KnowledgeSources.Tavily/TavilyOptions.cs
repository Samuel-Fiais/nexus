namespace Nexus.KnowledgeSources.Tavily;

public class TavilyOptions
{
    /// <summary>
    /// Chave de API da Tavily. NUNCA commitar; configure via env var Tavily__ApiKey
    /// (secao "Tavily" do appsettings) ou user-secrets.
    /// </summary>
    public string? ApiKey { get; set; }

    public string BaseUrl { get; set; } = "https://api.tavily.com";
}
