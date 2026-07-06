using System.Net;
using System.Text;
using Microsoft.Extensions.Options;
using Nexus.KnowledgeSources.Tavily;

namespace Nexus.Tests.KnowledgeSources;

/// <summary>
/// Task 11.3: integracao da extracao de website com a API da Tavily mockada em nivel de HTTP.
/// </summary>
public class TavilyWebContentExtractorTests
{
    private class FakeHandler(HttpStatusCode statusCode, string responseBody) : HttpMessageHandler
    {
        public HttpRequestMessage? LastRequest { get; private set; }
        public string? LastRequestBody { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken
        )
        {
            LastRequest = request;
            LastRequestBody =
                request.Content is null
                    ? null
                    : await request.Content.ReadAsStringAsync(cancellationToken);

            return new HttpResponseMessage(statusCode)
            {
                Content = new StringContent(responseBody, Encoding.UTF8, "application/json"),
            };
        }
    }

    private class FakeHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler);
    }

    private static TavilyWebContentExtractor CreateExtractor(
        FakeHandler handler,
        string? apiKey = "test-key"
    ) =>
        new(
            new FakeHttpClientFactory(handler),
            Options.Create(new TavilyOptions { ApiKey = apiKey })
        );

    [Fact]
    public async Task Extracts_Raw_Content_From_Tavily_Response()
    {
        var handler = new FakeHandler(
            HttpStatusCode.OK,
            """{"results":[{"url":"https://exemplo.com","raw_content":"conteudo da pagina"}]}"""
        );
        var extractor = CreateExtractor(handler);

        var content = await extractor.ExtractAsync("https://exemplo.com", CancellationToken.None);

        Assert.Equal("conteudo da pagina", content);
        Assert.NotNull(handler.LastRequest);
        Assert.Equal("https://api.tavily.com/extract", handler.LastRequest!.RequestUri!.ToString());
        Assert.Equal("Bearer", handler.LastRequest.Headers.Authorization!.Scheme);
        Assert.Contains("https://exemplo.com", handler.LastRequestBody);
    }

    [Fact]
    public async Task Throws_When_Tavily_Returns_No_Content()
    {
        var handler = new FakeHandler(HttpStatusCode.OK, """{"results":[]}""");
        var extractor = CreateExtractor(handler);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => extractor.ExtractAsync("https://exemplo.com", CancellationToken.None)
        );
    }

    [Fact]
    public async Task Throws_When_Api_Key_Is_Missing()
    {
        var handler = new FakeHandler(HttpStatusCode.OK, "{}");
        var extractor = CreateExtractor(handler, apiKey: null);

        await Assert.ThrowsAsync<InvalidOperationException>(
            () => extractor.ExtractAsync("https://exemplo.com", CancellationToken.None)
        );
    }
}
