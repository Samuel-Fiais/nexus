using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexus.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddConversationSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "ConversationSessionId",
                table: "Interactions",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SessionWindowNumber",
                table: "Interactions",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ConversationSessions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SessionKey = table.Column<string>(type: "TEXT", nullable: false),
                    SlackChannelId = table.Column<string>(type: "TEXT", nullable: true),
                    SlackThreadTs = table.Column<string>(type: "TEXT", nullable: true),
                    Summary = table.Column<string>(type: "TEXT", nullable: true),
                    CurrentWindowNumber = table.Column<int>(type: "INTEGER", nullable: false),
                    MessageCountInWindow = table.Column<int>(type: "INTEGER", nullable: false),
                    TotalMessageCount = table.Column<int>(type: "INTEGER", nullable: false),
                    LastCompactedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: true),
                    CreatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false),
                    UpdatedAt = table.Column<DateTimeOffset>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConversationSessions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Interactions_ConversationSessionId_SessionWindowNumber",
                table: "Interactions",
                columns: new[] { "ConversationSessionId", "SessionWindowNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_ConversationSessions_SessionKey",
                table: "ConversationSessions",
                column: "SessionKey",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ConversationSessions");

            migrationBuilder.DropIndex(
                name: "IX_Interactions_ConversationSessionId_SessionWindowNumber",
                table: "Interactions");

            migrationBuilder.DropColumn(
                name: "ConversationSessionId",
                table: "Interactions");

            migrationBuilder.DropColumn(
                name: "SessionWindowNumber",
                table: "Interactions");
        }
    }
}
