using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Nexus.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddInteractionCostTracking : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CachedTokens",
                table: "Interactions",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "EstimatedCostUsd",
                table: "Interactions",
                type: "TEXT",
                precision: 18,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "InputTokens",
                table: "Interactions",
                type: "INTEGER",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "OutputTokens",
                table: "Interactions",
                type: "INTEGER",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CachedTokens",
                table: "Interactions");

            migrationBuilder.DropColumn(
                name: "EstimatedCostUsd",
                table: "Interactions");

            migrationBuilder.DropColumn(
                name: "InputTokens",
                table: "Interactions");

            migrationBuilder.DropColumn(
                name: "OutputTokens",
                table: "Interactions");
        }
    }
}
