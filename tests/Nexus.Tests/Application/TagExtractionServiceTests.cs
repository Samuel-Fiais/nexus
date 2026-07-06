using Nexus.Application.Abstractions.Persistence;
using Nexus.Application.Tags;
using Nexus.Domain.Entities;

namespace Nexus.Tests.Application;

public class TagExtractionServiceTests
{
    private class FakeTagRepository(IReadOnlyList<Tag> tags) : ITagRepository
    {
        public Task<Tag?> GetBySlugAsync(string slug, CancellationToken ct) =>
            Task.FromResult(tags.FirstOrDefault(t => t.Slug == slug));

        public Task<IReadOnlyList<Tag>> GetAllAsync(CancellationToken ct) =>
            Task.FromResult(tags);

        public Task AddAsync(Tag tag, CancellationToken ct) => Task.CompletedTask;

        public Task ReplaceDocumentTagsAsync(
            Guid documentId,
            IReadOnlyList<string> tagNames,
            CancellationToken ct
        ) => Task.CompletedTask;
    }

    private static Tag MakeTag(string name) =>
        new()
        {
            Id = Guid.NewGuid(),
            Name = name,
            Slug = TagSlug.From(name),
            CreatedAt = DateTimeOffset.UtcNow,
        };

    [Fact]
    public async Task Matches_Tag_Mentioned_In_Question_Ignoring_Accents()
    {
        var service = new TagExtractionService(
            new FakeTagRepository([MakeTag("férias"), MakeTag("impressoras")])
        );

        var result = await service.ExtractMatchingTagSlugsAsync(
            "Como solicito minhas FERIAS no sistema?",
            CancellationToken.None
        );

        Assert.Equal(["ferias"], result);
    }

    [Fact]
    public async Task Multi_Word_Tag_Requires_All_Tokens_Present()
    {
        var service = new TagExtractionService(
            new FakeTagRepository([MakeTag("folha-de-pagamento")])
        );

        var matched = await service.ExtractMatchingTagSlugsAsync(
            "duvida sobre a folha de pagamento deste mes",
            CancellationToken.None
        );
        var notMatched = await service.ExtractMatchingTagSlugsAsync(
            "duvida sobre pagamento de fornecedor",
            CancellationToken.None
        );

        Assert.Equal(["folha-de-pagamento"], matched);
        Assert.Empty(notMatched);
    }

    [Fact]
    public async Task Returns_Empty_When_No_Tags_Exist()
    {
        var service = new TagExtractionService(new FakeTagRepository([]));

        var result = await service.ExtractMatchingTagSlugsAsync(
            "qualquer pergunta",
            CancellationToken.None
        );

        Assert.Empty(result);
    }
}
