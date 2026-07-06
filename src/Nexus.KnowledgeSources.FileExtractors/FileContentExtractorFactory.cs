using Nexus.Domain.Enums;
using Nexus.KnowledgeSources.Abstractions;

namespace Nexus.KnowledgeSources.FileExtractors;

public class FileContentExtractorFactory(IEnumerable<IFileContentExtractor> extractors)
    : IFileContentExtractorFactory
{
    public IFileContentExtractor GetExtractor(DocumentContentType contentType) =>
        extractors.FirstOrDefault(e => e.ContentType == contentType)
        ?? throw new InvalidOperationException(
            $"Nenhum IFileContentExtractor registrado para o tipo '{contentType}'."
        );
}
