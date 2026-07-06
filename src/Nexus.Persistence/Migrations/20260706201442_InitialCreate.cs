using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexus.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ConversationSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionKey = table.Column<string>(type: "text", nullable: false),
                    SlackChannelId = table.Column<string>(type: "text", nullable: true),
                    SlackThreadTs = table.Column<string>(type: "text", nullable: true),
                    Summary = table.Column<string>(type: "text", nullable: true),
                    CurrentWindowNumber = table.Column<int>(type: "integer", nullable: false),
                    MessageCountInWindow = table.Column<int>(type: "integer", nullable: false),
                    TotalMessageCount = table.Column<int>(type: "integer", nullable: false),
                    LastCompactedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConversationSessions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DocumentChunks",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DocumentId = table.Column<Guid>(type: "uuid", nullable: false),
                    ChunkIndex = table.Column<int>(type: "integer", nullable: false),
                    Content = table.Column<string>(type: "text", nullable: false),
                    MetadataJson = table.Column<string>(type: "text", nullable: true),
                    Embedding = table.Column<byte[]>(type: "bytea", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentChunks", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Documents",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Title = table.Column<string>(type: "text", nullable: false),
                    ExternalId = table.Column<string>(type: "text", nullable: false),
                    ContentType = table.Column<string>(type: "text", nullable: false),
                    ContentHash = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Documents", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DocumentTags",
                columns: table => new
                {
                    DocumentId = table.Column<Guid>(type: "uuid", nullable: false),
                    TagId = table.Column<Guid>(type: "uuid", nullable: false),
                    Confidence = table.Column<double>(type: "double precision", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DocumentTags", x => new { x.DocumentId, x.TagId });
                });

            migrationBuilder.CreateTable(
                name: "Interactions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConversationSessionId = table.Column<Guid>(type: "uuid", nullable: true),
                    SessionWindowNumber = table.Column<int>(type: "integer", nullable: true),
                    SlackChannelId = table.Column<string>(type: "text", nullable: true),
                    SlackThreadTs = table.Column<string>(type: "text", nullable: true),
                    SlackEventId = table.Column<string>(type: "text", nullable: false),
                    Question = table.Column<string>(type: "text", nullable: false),
                    Answer = table.Column<string>(type: "text", nullable: true),
                    SourcesJson = table.Column<string>(type: "text", nullable: true),
                    TagsMatchedJson = table.Column<string>(type: "text", nullable: true),
                    Model = table.Column<string>(type: "text", nullable: true),
                    TokensUsed = table.Column<int>(type: "integer", nullable: true),
                    InputTokens = table.Column<int>(type: "integer", nullable: true),
                    OutputTokens = table.Column<int>(type: "integer", nullable: true),
                    CachedTokens = table.Column<int>(type: "integer", nullable: true),
                    EstimatedCostUsd = table.Column<decimal>(type: "numeric(18,6)", precision: 18, scale: 6, nullable: true),
                    Status = table.Column<string>(type: "text", nullable: false),
                    ErrorMessage = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Interactions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "KnowledgeSources",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    UrlOrPath = table.Column<string>(type: "text", nullable: false),
                    Provider = table.Column<string>(type: "text", nullable: true),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    LastSyncAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: true),
                    MetadataJson = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_KnowledgeSources", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Tags",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Slug = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Tags", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "UserDailyUsages",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    RequestCount = table.Column<int>(type: "integer", nullable: false),
                    TokenCount = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UserDailyUsages", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SlackUserId = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Email = table.Column<string>(type: "text", nullable: true),
                    Role = table.Column<string>(type: "text", nullable: false),
                    Active = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ConversationSessions_SessionKey",
                table: "ConversationSessions",
                column: "SessionKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_DocumentChunks_DocumentId_ChunkIndex",
                table: "DocumentChunks",
                columns: new[] { "DocumentId", "ChunkIndex" });

            migrationBuilder.CreateIndex(
                name: "IX_Documents_SourceId_ExternalId",
                table: "Documents",
                columns: new[] { "SourceId", "ExternalId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Interactions_ConversationSessionId_SessionWindowNumber",
                table: "Interactions",
                columns: new[] { "ConversationSessionId", "SessionWindowNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_Interactions_SlackEventId",
                table: "Interactions",
                column: "SlackEventId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Tags_Slug",
                table: "Tags",
                column: "Slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_UserDailyUsages_UserId_Date",
                table: "UserDailyUsages",
                columns: new[] { "UserId", "Date" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Users_SlackUserId",
                table: "Users",
                column: "SlackUserId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ConversationSessions");

            migrationBuilder.DropTable(
                name: "DocumentChunks");

            migrationBuilder.DropTable(
                name: "Documents");

            migrationBuilder.DropTable(
                name: "DocumentTags");

            migrationBuilder.DropTable(
                name: "Interactions");

            migrationBuilder.DropTable(
                name: "KnowledgeSources");

            migrationBuilder.DropTable(
                name: "Tags");

            migrationBuilder.DropTable(
                name: "UserDailyUsages");

            migrationBuilder.DropTable(
                name: "Users");
        }
    }
}
