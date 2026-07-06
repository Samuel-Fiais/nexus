using Nexus.Domain.Enums;

namespace Nexus.KnowledgeSources.Abstractions;

public record SourceItem(string ExternalId, string Title, DocumentContentType ContentType);
