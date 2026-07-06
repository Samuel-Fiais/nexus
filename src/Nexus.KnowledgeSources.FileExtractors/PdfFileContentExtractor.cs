using System.Text;
using Docnet.Core;
using Docnet.Core.Models;
using Nexus.Domain.Enums;
using Nexus.KnowledgeSources.Abstractions;

namespace Nexus.KnowledgeSources.FileExtractors;

/// <summary>
/// Extrai o texto de um PDF via Docnet.Core (wrapper do PDFium). Recebe os bytes do arquivo,
/// entao funciona igual independente da origem (pasta local, Google Drive, Notion, etc).
/// </summary>
public class PdfFileContentExtractor : IFileContentExtractor
{
    public DocumentContentType ContentType => DocumentContentType.Pdf;

    public async Task<string> ExtractAsync(Stream fileStream, CancellationToken ct)
    {
        using var buffer = new MemoryStream();
        await fileStream.CopyToAsync(buffer, ct);
        var bytes = buffer.ToArray();

        return await Task.Run(() => ExtractText(bytes), ct);
    }

    private static string ExtractText(byte[] bytes)
    {
        using var docReader = DocLib.Instance.GetDocReader(bytes, new PageDimensions(1080, 1920));

        var text = new StringBuilder();
        for (var i = 0; i < docReader.GetPageCount(); i++)
        {
            using var pageReader = docReader.GetPageReader(i);
            text.AppendLine(pageReader.GetText());
        }

        var content = text.ToString().Trim();
        if (string.IsNullOrWhiteSpace(content))
        {
            throw new InvalidOperationException(
                "Nao foi possivel extrair texto do PDF (pode ser um PDF escaneado sem camada de texto)."
            );
        }

        return content;
    }
}
