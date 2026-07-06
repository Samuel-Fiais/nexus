using Nexus.Domain.Enums;

namespace Nexus.KnowledgeSources.Abstractions;

public interface IFileContentExtractorFactory
{
    IFileContentExtractor GetExtractor(DocumentContentType contentType);
}
