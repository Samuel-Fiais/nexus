using System.Text;
using Nexus.Application.Embeddings;

namespace Nexus.Application.Tags;

/// <summary>
/// Normaliza nomes de tags para slugs kebab-case sem acentos, garantindo unicidade
/// case/acento-insensivel (indice unico em Tag.Slug).
/// </summary>
public static class TagSlug
{
    public static string From(string name)
    {
        var normalized = HashingEmbeddingProvider.RemoveDiacritics(name.Trim().ToLowerInvariant());
        var sb = new StringBuilder(normalized.Length);
        var lastWasSeparator = true;

        foreach (var ch in normalized)
        {
            if (char.IsLetterOrDigit(ch))
            {
                sb.Append(ch);
                lastWasSeparator = false;
            }
            else if (!lastWasSeparator)
            {
                sb.Append('-');
                lastWasSeparator = true;
            }
        }

        return sb.ToString().TrimEnd('-');
    }
}
