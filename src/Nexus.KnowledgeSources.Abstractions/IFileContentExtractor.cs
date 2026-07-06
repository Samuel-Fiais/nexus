using Nexus.Domain.Enums;

namespace Nexus.KnowledgeSources.Abstractions;

/// <summary>
/// Extrai o conteudo textual de um arquivo a partir dos seus bytes, independente de onde o
/// arquivo esteja armazenado (pasta local, Google Drive, Notion, etc). Cada provider de
/// KnowledgeSource resolve o extractor certo pelo DocumentContentType e so precisa fornecer
/// o Stream do arquivo — a logica de parsing (markdown, PDF, ...) fica centralizada aqui e e
/// reaproveitada por qualquer origem de armazenamento.
/// </summary>
public interface IFileContentExtractor
{
    DocumentContentType ContentType { get; }

    Task<string> ExtractAsync(Stream fileStream, CancellationToken ct);
}
