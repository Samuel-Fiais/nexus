namespace Nexus.Application.Embeddings;

/// <summary>
/// Utilitarios de serializacao e comparacao de embeddings. O embedding e persistido em
/// DocumentChunk.Embedding como bytes (float[] contiguo, little-endian via Buffer.BlockCopy).
/// </summary>
public static class EmbeddingVector
{
    public static byte[] ToBytes(float[] vector)
    {
        var bytes = new byte[vector.Length * sizeof(float)];
        Buffer.BlockCopy(vector, 0, bytes, 0, bytes.Length);
        return bytes;
    }

    public static float[] ToFloats(byte[] bytes)
    {
        var vector = new float[bytes.Length / sizeof(float)];
        Buffer.BlockCopy(bytes, 0, vector, 0, bytes.Length);
        return vector;
    }

    /// <summary>
    /// Similaridade de cosseno entre dois vetores. Retorna 0 quando dimensoes divergem
    /// ou quando qualquer um dos vetores tem norma zero.
    /// </summary>
    public static double CosineSimilarity(float[] a, float[] b)
    {
        if (a.Length == 0 || a.Length != b.Length)
        {
            return 0;
        }

        double dot = 0,
            normA = 0,
            normB = 0;
        for (var i = 0; i < a.Length; i++)
        {
            dot += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }

        if (normA == 0 || normB == 0)
        {
            return 0;
        }

        return dot / (Math.Sqrt(normA) * Math.Sqrt(normB));
    }
}
