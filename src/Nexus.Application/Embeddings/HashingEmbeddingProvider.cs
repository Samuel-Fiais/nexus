using System.Globalization;
using System.Text;
using Nexus.Application.Abstractions;

namespace Nexus.Application.Embeddings;

/// <summary>
/// Provedor de embeddings local e deterministico baseado em feature hashing (bag-of-words):
/// cada token e normalizado (minusculas, sem acentos), hasheado (FNV-1a) para um bucket de um
/// vetor de dimensao fixa e o vetor final e normalizado (L2). Nao requer nenhuma API externa,
/// e suficiente para similaridade de cosseno lexical entre pergunta e chunks.
///
/// Ponto de extensao (Epico 12): para embeddings semanticos reais (OpenAI, Voyage, etc.),
/// basta implementar IEmbeddingProvider em um novo modulo e trocar o registro no DI. Como a
/// dimensao/semantica do vetor muda, os documentos precisam ser reindexados apos a troca.
/// </summary>
public class HashingEmbeddingProvider : IEmbeddingProvider
{
    public const int Dimensions = 512;

    public Task<float[]> GenerateEmbeddingAsync(string text, CancellationToken ct) =>
        Task.FromResult(GenerateEmbedding(text));

    public static float[] GenerateEmbedding(string text)
    {
        var vector = new float[Dimensions];
        foreach (var token in Tokenize(text))
        {
            var bucket = (int)(Fnv1aHash(token) % Dimensions);
            vector[bucket] += 1f;
        }

        Normalize(vector);
        return vector;
    }

    public static IEnumerable<string> Tokenize(string text)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            yield break;
        }

        var sb = new StringBuilder();
        foreach (var ch in RemoveDiacritics(text.ToLowerInvariant()))
        {
            if (char.IsLetterOrDigit(ch))
            {
                sb.Append(ch);
                continue;
            }

            if (sb.Length >= 2)
            {
                yield return sb.ToString();
            }
            sb.Clear();
        }

        if (sb.Length >= 2)
        {
            yield return sb.ToString();
        }
    }

    public static string RemoveDiacritics(string text)
    {
        var sanitized = RemoveInvalidCodePoints(text);

        string normalized;
        try
        {
            normalized = sanitized.Normalize(NormalizationForm.FormD);
        }
        catch (ArgumentException)
        {
            // Alguns extractores (ex: PDF) podem produzir sequencias que o proprio ICU
            // considera invalidas mesmo apos a sanitizacao de surrogates/nao-caracteres.
            // Nesse caso, seguimos sem a normalizacao de acentos em vez de derrubar a
            // indexacao inteira do documento.
            return sanitized;
        }

        var sb = new StringBuilder(normalized.Length);
        foreach (var ch in normalized)
        {
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark)
            {
                sb.Append(ch);
            }
        }

        try
        {
            return sb.ToString().Normalize(NormalizationForm.FormC);
        }
        catch (ArgumentException)
        {
            return sb.ToString();
        }
    }

    private static string RemoveInvalidCodePoints(string text)
    {
        var sb = new StringBuilder(text.Length);
        for (var i = 0; i < text.Length; i++)
        {
            var ch = text[i];
            if (char.IsHighSurrogate(ch))
            {
                if (
                    i + 1 < text.Length
                    && char.IsLowSurrogate(text[i + 1])
                    && !IsNonCharacter(ch, text[i + 1])
                )
                {
                    sb.Append(ch);
                    sb.Append(text[i + 1]);
                    i++;
                }
                continue;
            }

            if (char.IsLowSurrogate(ch))
            {
                continue;
            }

            // Controles (exceto espacos em branco comuns) e nao-caracteres do BMP
            // (ex: U+FFFE, U+FFFF, U+FDD0-U+FDEF) tambem sao rejeitados pelo ICU.
            if (char.IsControl(ch) && !char.IsWhiteSpace(ch))
            {
                continue;
            }

            if (ch is >= '﷐' and <= '﷯' or '￾' or '￿')
            {
                continue;
            }

            sb.Append(ch);
        }

        return sb.ToString();
    }

    private static bool IsNonCharacter(char high, char low)
    {
        var codePoint = char.ConvertToUtf32(high, low);
        var withinPlane = codePoint & 0xFFFF;
        return withinPlane is 0xFFFE or 0xFFFF;
    }

    private static uint Fnv1aHash(string token)
    {
        const uint offsetBasis = 2166136261;
        const uint prime = 16777619;

        var hash = offsetBasis;
        foreach (var ch in token)
        {
            hash ^= ch;
            hash *= prime;
        }

        return hash;
    }

    private static void Normalize(float[] vector)
    {
        double norm = 0;
        foreach (var value in vector)
        {
            norm += value * value;
        }

        if (norm == 0)
        {
            return;
        }

        var factor = (float)(1.0 / Math.Sqrt(norm));
        for (var i = 0; i < vector.Length; i++)
        {
            vector[i] *= factor;
        }
    }
}
