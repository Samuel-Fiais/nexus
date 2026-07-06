namespace Nexus.Api.Admin;

public class AdminOptions
{
    /// <summary>
    /// Chave exigida no header X-Admin-Api-Key para acessar os endpoints /admin/*.
    /// Configure via env var Admin__ApiKey ou user-secrets; enquanto nao definida,
    /// todos os endpoints administrativos respondem 401.
    /// </summary>
    public string? ApiKey { get; set; }
}
