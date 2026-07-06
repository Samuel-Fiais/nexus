using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.Extensions.Options;

namespace Nexus.Api.Admin;

/// <summary>
/// Protecao simples dos endpoints administrativos: exige o header X-Admin-Api-Key com o valor
/// de Admin:ApiKey. Comparacao em tempo constante para evitar timing attacks.
/// </summary>
public class AdminApiKeyFilter(IOptions<AdminOptions> options) : IAuthorizationFilter
{
    public const string HeaderName = "X-Admin-Api-Key";

    private readonly AdminOptions _options = options.Value;

    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var configuredKey = _options.ApiKey;
        if (string.IsNullOrWhiteSpace(configuredKey))
        {
            context.Result = new UnauthorizedObjectResult(
                new { error = "Admin API key nao configurada (Admin:ApiKey)." }
            );
            return;
        }

        var providedKey = context.HttpContext.Request.Headers[HeaderName].ToString();
        if (
            string.IsNullOrEmpty(providedKey)
            || !CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(providedKey),
                Encoding.UTF8.GetBytes(configuredKey)
            )
        )
        {
            context.Result = new UnauthorizedResult();
        }
    }
}
