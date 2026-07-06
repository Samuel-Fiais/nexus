using Nexus.Domain.Enums;
using Nexus.KnowledgeSources.Abstractions;

namespace Nexus.KnowledgeSources.FileExtractors;

public class MarkdownFileContentExtractor : IFileContentExtractor
{
    public DocumentContentType ContentType => DocumentContentType.Markdown;

    public async Task<string> ExtractAsync(Stream fileStream, CancellationToken ct)
    {
        using var reader = new StreamReader(fileStream);
        return await reader.ReadToEndAsync(ct);
    }
}
