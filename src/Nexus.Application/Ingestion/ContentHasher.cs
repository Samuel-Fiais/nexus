using System.Security.Cryptography;
using System.Text;

namespace Nexus.Application.Ingestion;

/// <summary>
/// Hash SHA-256 do conteudo de um documento (regra 6.4), usado para pular reindexacao
/// quando o conteudo nao mudou desde a ultima sincronizacao.
/// </summary>
public static class ContentHasher
{
    public static string Sha256(string content)
    {
        var bytes = Encoding.UTF8.GetBytes(content);
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
