using Nexus.Application.Ingestion;

namespace Nexus.Tests.Ingestion;

public class ContentHasherTests
{
    [Fact]
    public void Hash_Is_Deterministic()
    {
        Assert.Equal(ContentHasher.Sha256("conteudo"), ContentHasher.Sha256("conteudo"));
    }

    [Fact]
    public void Different_Content_Produces_Different_Hash()
    {
        Assert.NotEqual(ContentHasher.Sha256("a"), ContentHasher.Sha256("b"));
    }

    [Fact]
    public void Hash_Matches_Known_Sha256_Value()
    {
        // SHA-256("abc") — vetor de teste conhecido (FIPS 180-2).
        Assert.Equal(
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
            ContentHasher.Sha256("abc")
        );
    }
}
