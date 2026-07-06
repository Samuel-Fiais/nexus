using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace Nexus.Slack;

/// <summary>
/// Valida a assinatura HMAC-SHA256 enviada pelo Slack em cada requisicao de evento,
/// conforme https://api.slack.com/authentication/verifying-requests-from-slack.
/// </summary>
public class SlackSignatureValidator
{
    private static readonly TimeSpan MaxClockSkew = TimeSpan.FromMinutes(5);

    public bool IsValid(string signingSecret, string timestamp, string body, string signatureHeader)
    {
        if (
            string.IsNullOrWhiteSpace(signingSecret)
            || string.IsNullOrWhiteSpace(timestamp)
            || string.IsNullOrWhiteSpace(signatureHeader)
        )
        {
            return false;
        }

        if (
            !long.TryParse(
                timestamp,
                NumberStyles.Integer,
                CultureInfo.InvariantCulture,
                out var timestampSeconds
            )
        )
        {
            return false;
        }

        var requestTime = DateTimeOffset.FromUnixTimeSeconds(timestampSeconds);
        if ((DateTimeOffset.UtcNow - requestTime).Duration() > MaxClockSkew)
        {
            return false;
        }

        var baseString = $"v0:{timestamp}:{body}";
        var keyBytes = Encoding.UTF8.GetBytes(signingSecret);
        var baseBytes = Encoding.UTF8.GetBytes(baseString);

        var hash = HMACSHA256.HashData(keyBytes, baseBytes);
        var computedSignature = "v0=" + Convert.ToHexString(hash).ToLowerInvariant();

        var expectedBytes = Encoding.UTF8.GetBytes(computedSignature);
        var actualBytes = Encoding.UTF8.GetBytes(signatureHeader);

        if (expectedBytes.Length != actualBytes.Length)
        {
            return false;
        }

        return CryptographicOperations.FixedTimeEquals(expectedBytes, actualBytes);
    }
}
