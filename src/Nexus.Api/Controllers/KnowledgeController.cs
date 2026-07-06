using Microsoft.AspNetCore.Mvc;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Domain.Enums;

namespace Nexus.Api.Controllers;

[ApiController]
[Route("knowledge")]
public class KnowledgeController(
    IDocumentRepository documentRepository,
    IKnowledgeSourceRepository knowledgeSourceRepository
) : ControllerBase
{
    [HttpGet("documents/{id:guid}")]
    public async Task<IActionResult> OpenDocumentAsync(Guid id, CancellationToken ct)
    {
        var document = await documentRepository.GetByIdAsync(id, ct);
        if (document is null)
        {
            return NotFound();
        }

        var source = await knowledgeSourceRepository.GetByIdAsync(document.SourceId, ct);
        if (source is null)
        {
            return NotFound();
        }

        var fullPath = Path.GetFullPath(Path.Combine(source.UrlOrPath, document.ExternalId));
        if (!System.IO.File.Exists(fullPath))
        {
            return NotFound();
        }

        if (document.ContentType == DocumentContentType.WebsiteLink)
        {
            var url = (await System.IO.File.ReadAllLinesAsync(fullPath, ct))
                .FirstOrDefault(line => !string.IsNullOrWhiteSpace(line))
                ?.Trim();

            return string.IsNullOrWhiteSpace(url) ? NotFound() : Redirect(url);
        }

        var downloadName = Path.GetFileName(fullPath);
        var contentType = document.ContentType switch
        {
            DocumentContentType.Pdf => "application/pdf",
            DocumentContentType.Markdown => "text/markdown",
            _ => "application/octet-stream",
        };

        return PhysicalFile(fullPath, contentType, downloadName);
    }
}
