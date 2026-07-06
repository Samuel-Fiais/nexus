namespace Nexus.Llm.DeepSeek;

public class DeepSeekOptions
{
    public string? ApiKey { get; set; }
    public string BaseUrl { get; set; } = "https://api.deepseek.com";
    public string Model { get; set; } = "deepseek-v4-flash";

    /// <summary>
    /// Precos em USD por 1 milhao de tokens. Valores default refletem a tabela publica da
    /// DeepSeek para o modelo deepseek-v4-flash; confirme em https://api-docs.deepseek.com/quick_start/pricing
    /// e ajuste via config (DeepSeek:PriceCacheHitPerMillionUsd etc.) se mudarem.
    /// </summary>
    public decimal PriceCacheHitPerMillionUsd { get; set; } = 0.0028m;
    public decimal PriceCacheMissPerMillionUsd { get; set; } = 0.14m;
    public decimal PriceOutputPerMillionUsd { get; set; } = 0.28m;
}
