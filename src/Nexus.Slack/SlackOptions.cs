namespace Nexus.Slack;

public class SlackOptions
{
    public string? SigningSecret { get; set; }
    public string? BotToken { get; set; }
    public string? RefreshToken { get; set; }
    public string? ClientId { get; set; }
    public string? ClientSecret { get; set; }
    public string? VerificationToken { get; set; }
    public string? AppId { get; set; }

    /// <summary>
    /// Politica de autorizacao por workspace (regra 9.1): quando definido (env var
    /// Slack__AllowedTeamId), somente eventos originados desse team_id do Slack sao
    /// processados; eventos de outros workspaces sao ignorados. Quando vazio, qualquer
    /// workspace que passe na validacao de assinatura e aceito (uso apenas em ambiente
    /// controlado de desenvolvimento).
    /// </summary>
    public string? AllowedTeamId { get; set; }
}
