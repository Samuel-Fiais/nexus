using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Nexus.Api.Admin;
using Nexus.Application.Abstractions.Persistence;
using Nexus.Application.UseCases;
using Nexus.Domain.Entities;
using Nexus.Domain.Enums;
using Nexus.Persistence;

namespace Nexus.Api.Controllers;

/// <summary>
/// Endpoints administrativos (regras 5.4, 7.6, 10.3 e 10.4). Consultas de leitura usam o
/// NexusDbContext diretamente (relatorios ad-hoc); escrita de KnowledgeSource passa pelo
/// repositorio. Todos exigem o header X-Admin-Api-Key (ver AdminApiKeyFilter).
/// </summary>
[ApiController]
[Route("admin")]
[ServiceFilter(typeof(AdminApiKeyFilter))]
public class AdminController(
    NexusDbContext db,
    IKnowledgeSourceRepository sourceRepository,
    IQuestionOrchestrator questionOrchestrator
) : ControllerBase
{
    public record KnowledgeSourceRequest(
        string Name,
        KnowledgeSourceType Type,
        string UrlOrPath,
        bool Active = true,
        string? MetadataJson = null
    );

    public record AskRequest(string Question, string? SlackUserId = null);

    // ----- Simulacao de pergunta do Slack, para teste local sem precisar do webhook real -----

    [HttpPost("ask")]
    public async Task<IActionResult> AskAsync([FromBody] AskRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Question))
        {
            return BadRequest(new { error = "Question e obrigatoria." });
        }

        var slackRequest = new SlackQuestionRequest(
            SlackUserId: string.IsNullOrWhiteSpace(request.SlackUserId)
                ? "admin-test-user"
                : request.SlackUserId,
            SlackUserName: null,
            SlackChannelId: null,
            SlackThreadTs: null,
            SlackEventId: Guid.NewGuid().ToString(),
            Question: request.Question
        );

        var result = await questionOrchestrator.HandleQuestionAsync(slackRequest, ct);
        return Ok(new { answer = result.Answer });
    }

    // ----- 5.4: CRUD de KnowledgeSource -----

    [HttpGet("knowledge-sources")]
    public async Task<IActionResult> ListKnowledgeSourcesAsync(CancellationToken ct) =>
        Ok(await sourceRepository.GetAllAsync(ct));

    [HttpGet("knowledge-sources/{id:guid}")]
    public async Task<IActionResult> GetKnowledgeSourceAsync(Guid id, CancellationToken ct)
    {
        var source = await sourceRepository.GetByIdAsync(id, ct);
        return source is null ? NotFound() : Ok(source);
    }

    [HttpPost("knowledge-sources")]
    public async Task<IActionResult> CreateKnowledgeSourceAsync(
        [FromBody] KnowledgeSourceRequest request,
        CancellationToken ct
    )
    {
        var now = DateTimeOffset.UtcNow;
        var source = new KnowledgeSource
        {
            Id = Guid.NewGuid(),
            Name = request.Name,
            Type = request.Type,
            UrlOrPath = request.UrlOrPath,
            Active = request.Active,
            MetadataJson = request.MetadataJson,
            CreatedAt = now,
            UpdatedAt = now,
        };

        await sourceRepository.AddAsync(source, ct);
        return Created($"/admin/knowledge-sources/{source.Id}", source);
    }

    [HttpPut("knowledge-sources/{id:guid}")]
    public async Task<IActionResult> UpdateKnowledgeSourceAsync(
        Guid id,
        [FromBody] KnowledgeSourceRequest request,
        CancellationToken ct
    )
    {
        var source = await sourceRepository.GetByIdAsync(id, ct);
        if (source is null)
        {
            return NotFound();
        }

        source.Name = request.Name;
        source.Type = request.Type;
        source.UrlOrPath = request.UrlOrPath;
        source.Active = request.Active;
        source.MetadataJson = request.MetadataJson;
        source.UpdatedAt = DateTimeOffset.UtcNow;

        await sourceRepository.UpdateAsync(source, ct);
        return Ok(source);
    }

    [HttpDelete("knowledge-sources/{id:guid}")]
    public async Task<IActionResult> DeleteKnowledgeSourceAsync(Guid id, CancellationToken ct)
    {
        var deleted = await sourceRepository.DeleteAsync(id, ct);
        return deleted ? NoContent() : NotFound();
    }

    // ----- 7.6: tags e cobertura de documentos -----

    [HttpGet("tags")]
    public async Task<IActionResult> ListTagsAsync(CancellationToken ct)
    {
        var tags = await (
            from tag in db.Tags
            join documentTag in db.DocumentTags on tag.Id equals documentTag.TagId into links
            select new
            {
                tag.Id,
                tag.Name,
                tag.Slug,
                DocumentCount = links.Count(),
            }
        )
            .OrderByDescending(t => t.DocumentCount)
            .ThenBy(t => t.Slug)
            .ToListAsync(ct);

        return Ok(tags);
    }

    // ----- 10.3: consulta de logs de interacoes -----

    [HttpGet("interactions")]
    public async Task<IActionResult> ListInteractionsAsync(
        [FromQuery] string? slackUserId,
        [FromQuery] DateOnly? date,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default
    )
    {
        pageSize = Math.Clamp(pageSize, 1, 200);
        page = Math.Max(1, page);

        var query =
            from interaction in db.Interactions
            join user in db.Users on interaction.UserId equals user.Id
            select new { Interaction = interaction, user.SlackUserId };

        if (!string.IsNullOrWhiteSpace(slackUserId))
        {
            query = query.Where(x => x.SlackUserId == slackUserId);
        }

        if (date is not null)
        {
            var start = date.Value.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc);
            var end = start.AddDays(1);
            query = query.Where(x =>
                x.Interaction.CreatedAt >= start && x.Interaction.CreatedAt < end
            );
        }

        var total = await query.CountAsync(ct);
        var items = await query
            .OrderByDescending(x => x.Interaction.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new
            {
                x.Interaction.Id,
                x.SlackUserId,
                x.Interaction.Question,
                x.Interaction.Answer,
                x.Interaction.SourcesJson,
                x.Interaction.TagsMatchedJson,
                x.Interaction.Model,
                x.Interaction.TokensUsed,
                Status = x.Interaction.Status.ToString(),
                x.Interaction.ErrorMessage,
                x.Interaction.CreatedAt,
            })
            .ToListAsync(ct);

        return Ok(new { total, page, pageSize, items });
    }

    // ----- 10.4: uso por usuario -----

    [HttpGet("usage")]
    public async Task<IActionResult> GetUsageAsync(
        [FromQuery] DateOnly? date,
        CancellationToken ct
    )
    {
        var query =
            from usage in db.UserDailyUsages
            join user in db.Users on usage.UserId equals user.Id
            select new
            {
                usage.Date,
                user.SlackUserId,
                user.Name,
                usage.RequestCount,
                usage.TokenCount,
            };

        if (date is not null)
        {
            query = query.Where(x => x.Date == date.Value);
        }

        var items = await query
            .OrderByDescending(x => x.Date)
            .ThenByDescending(x => x.RequestCount)
            .Take(500)
            .ToListAsync(ct);

        return Ok(items);
    }
}
