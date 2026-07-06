using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.KnowledgeSources.Abstractions;

namespace Nexus.KnowledgeSources.LocalFolder;

/// <summary>
/// Varre recursivamente uma pasta local em busca de:
/// - arquivos .md — tratados como documentos Markdown;
/// - arquivos .pdf — tratados como Pdf;
/// - arquivos .url ou .link — tratados como WebsiteLink; o arquivo contem a URL (primeira
///   linha nao vazia) e o conteudo e extraido via IWebContentExtractor (Tavily web_extract).
/// Markdown e Pdf sao lidos como Stream e delegados ao IFileContentExtractorFactory — a mesma
/// logica de parsing por tipo de arquivo e reaproveitada por qualquer outro storage (Google
/// Drive, Notion, etc), que so precisa fornecer o Stream do arquivo.
/// </summary>
public class LocalFolderKnowledgeSourceProvider(
    IWebContentExtractor webContentExtractor,
    IFileContentExtractorFactory fileContentExtractorFactory
) : IKnowledgeSourceProvider
{
    private static readonly string[] LinkExtensions = [".url", ".link"];

    public Task<IReadOnlyList<SourceItem>> ListItemsAsync(
        KnowledgeSource source,
        CancellationToken ct
    )
    {
        var rootPath = source.UrlOrPath;
        if (!Directory.Exists(rootPath))
        {
            return Task.FromResult<IReadOnlyList<SourceItem>>([]);
        }

        var items = Directory
            .EnumerateFiles(rootPath, "*", SearchOption.AllDirectories)
            .Select(path => (Path: path, ContentType: ResolveContentType(path)))
            .Where(x => x.ContentType is not null)
            .Select(x =>
            {
                var relativePath = Path.GetRelativePath(rootPath, x.Path);
                var title = Path.GetFileNameWithoutExtension(x.Path);
                return new SourceItem(relativePath, title, x.ContentType!.Value);
            })
            .ToList();

        return Task.FromResult<IReadOnlyList<SourceItem>>(items);
    }

    public async Task<string> ReadContentAsync(
        KnowledgeSource source,
        SourceItem item,
        CancellationToken ct
    )
    {
        var fullPath = Path.Combine(source.UrlOrPath, item.ExternalId);

        if (item.ContentType == DocumentContentType.WebsiteLink)
        {
            var fileContent = await File.ReadAllLinesAsync(fullPath, ct);
            var url = fileContent.FirstOrDefault(line => !string.IsNullOrWhiteSpace(line))?.Trim();
            if (string.IsNullOrWhiteSpace(url))
            {
                throw new InvalidOperationException(
                    $"Arquivo de link '{item.ExternalId}' nao contem uma URL."
                );
            }

            return await webContentExtractor.ExtractAsync(url, ct);
        }

        var extractor = fileContentExtractorFactory.GetExtractor(item.ContentType);
        await using var fileStream = File.OpenRead(fullPath);
        return await extractor.ExtractAsync(fileStream, ct);
    }

    private static DocumentContentType? ResolveContentType(string path)
    {
        var extension = Path.GetExtension(path).ToLowerInvariant();
        if (extension == ".md")
        {
            return DocumentContentType.Markdown;
        }

        if (extension == ".pdf")
        {
            return DocumentContentType.Pdf;
        }

        if (LinkExtensions.Contains(extension))
        {
            return DocumentContentType.WebsiteLink;
        }

        return null;
    }
}
