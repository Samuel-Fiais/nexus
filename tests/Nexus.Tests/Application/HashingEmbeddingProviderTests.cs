using Nexus.Application.Embeddings;

namespace Nexus.Tests.Application;

public class HashingEmbeddingProviderTests
{
    [Fact]
    public async Task Embedding_Is_Deterministic_And_Normalized()
    {
        var provider = new HashingEmbeddingProvider();

        var a = await provider.GenerateEmbeddingAsync(
            "Como solicitar ferias?",
            CancellationToken.None
        );
        var b = await provider.GenerateEmbeddingAsync(
            "Como solicitar ferias?",
            CancellationToken.None
        );

        Assert.Equal(HashingEmbeddingProvider.Dimensions, a.Length);
        Assert.Equal(a, b);

        var norm = Math.Sqrt(a.Sum(v => (double)v * v));
        Assert.Equal(1.0, norm, precision: 5);
    }

    [Fact]
    public void Similar_Texts_Score_Higher_Than_Unrelated_Texts()
    {
        var question = HashingEmbeddingProvider.GenerateEmbedding(
            "como funciona a politica de ferias da empresa"
        );
        var related = HashingEmbeddingProvider.GenerateEmbedding(
            "a politica de ferias da empresa permite 30 dias por ano"
        );
        var unrelated = HashingEmbeddingProvider.GenerateEmbedding(
            "configuracao de impressoras no escritorio de rede local"
        );

        var relatedScore = EmbeddingVector.CosineSimilarity(question, related);
        var unrelatedScore = EmbeddingVector.CosineSimilarity(question, unrelated);

        Assert.True(
            relatedScore > unrelatedScore,
            $"esperado related ({relatedScore}) > unrelated ({unrelatedScore})"
        );
    }

    [Fact]
    public void Tokenization_Ignores_Accents_And_Case()
    {
        var withAccents = HashingEmbeddingProvider.GenerateEmbedding("Férias e Salário");
        var withoutAccents = HashingEmbeddingProvider.GenerateEmbedding("ferias e salario");

        Assert.Equal(withAccents, withoutAccents);
    }

    [Fact]
    public void Serialization_Roundtrip_Preserves_Vector()
    {
        var vector = HashingEmbeddingProvider.GenerateEmbedding("qualquer texto de teste");

        var roundtrip = EmbeddingVector.ToFloats(EmbeddingVector.ToBytes(vector));

        Assert.Equal(vector, roundtrip);
    }

    [Fact]
    public void Empty_Text_Produces_Zero_Vector_With_Zero_Similarity()
    {
        var empty = HashingEmbeddingProvider.GenerateEmbedding("   ");
        var other = HashingEmbeddingProvider.GenerateEmbedding("texto");

        Assert.Equal(0, EmbeddingVector.CosineSimilarity(empty, other));
    }
}
