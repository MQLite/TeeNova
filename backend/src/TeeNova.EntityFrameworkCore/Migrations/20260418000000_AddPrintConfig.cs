using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TeeNova.EntityFrameworkCore;

#nullable disable

namespace TeeNova.Migrations
{
    [DbContext(typeof(TeeNovaDbContext))]
    [Migration("20260418000000_AddPrintConfig")]
    public partial class AddPrintConfig : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PrintAreas",
                schema: "teenova",
                columns: table => new
                {
                    Id                  = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name                = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Code                = table.Column<string>(type: "nvarchar(64)",  maxLength: 64,  nullable: false),
                    BasePrice           = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    IsActive            = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder           = table.Column<int>(type: "int", nullable: false),
                    LegacyPositionValue = table.Column<int>(type: "int", nullable: true),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PrintAreas", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PrintSizes",
                schema: "teenova",
                columns: table => new
                {
                    Id        = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name      = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Code      = table.Column<string>(type: "nvarchar(64)",  maxLength: 64,  nullable: false),
                    BasePrice = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    IsActive  = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PrintSizes", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PrintAreas_Code",
                schema: "teenova",
                table: "PrintAreas",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PrintAreas_LegacyPositionValue",
                schema: "teenova",
                table: "PrintAreas",
                column: "LegacyPositionValue",
                unique: true,
                filter: "[LegacyPositionValue] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_PrintSizes_Code",
                schema: "teenova",
                table: "PrintSizes",
                column: "Code",
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PrintAreas",
                schema: "teenova");

            migrationBuilder.DropTable(
                name: "PrintSizes",
                schema: "teenova");
        }
    }
}
