using System.Security.Cryptography;
using System.Text;
using Nexus.Slack;

namespace Nexus.Tests.Slack;

public class SlackSignatureValidatorTests
{
    private const string SigningSecret = "8f742231b10e8888abcd99yyyzzz85a5";

    private static string ComputeSignature(string signingSecret, string timestamp, string body)
    {
        var baseString = $"v0:{timestamp}:{body}";
        var hash = HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(signingSecret),
            Encoding.UTF8.GetBytes(baseString)
        );
        return "v0=" + Convert.ToHexString(hash).ToLowerInvariant();
    }

    [Fact]
    public void Valid_Signature_Is_Accepted()
    {
        var validator = new SlackSignatureValidator();
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var body = "{\"type\":\"event_callback\"}";
        var signature = ComputeSignature(SigningSecret, timestamp, body);

        var result = validator.IsValid(SigningSecret, timestamp, body, signature);

        Assert.True(result);
    }

    [Fact]
    public void Invalid_Signature_Is_Rejected()
    {
        var validator = new SlackSignatureValidator();
        var timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var body = "{\"type\":\"event_callback\"}";

        var result = validator.IsValid(SigningSecret, timestamp, body, "v0=deadbeef");

        Assert.False(result);
    }

    [Fact]
    public void Expired_Timestamp_Is_Rejected()
    {
        var validator = new SlackSignatureValidator();
        var timestamp = DateTimeOffset.UtcNow.AddMinutes(-10).ToUnixTimeSeconds().ToString();
        var body = "{\"type\":\"event_callback\"}";
        var signature = ComputeSignature(SigningSecret, timestamp, body);

        var result = validator.IsValid(SigningSecret, timestamp, body, signature);

        Assert.False(result);
    }
}
