using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddPrintAreaSizeOptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PrintAreaSizeOptions",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PrintAreaId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PrintSizeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PrintAreaSizeOptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PrintAreaSizeOptions_PrintAreas_PrintAreaId",
                        column: x => x.PrintAreaId,
                        principalSchema: "teenova",
                        principalTable: "PrintAreas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PrintAreaSizeOptions_PrintSizes_PrintSizeId",
                        column: x => x.PrintSizeId,
                        principalSchema: "teenova",
                        principalTable: "PrintSizes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PrintAreaSizeOptions_PrintAreaId_PrintSizeId",
                schema: "teenova",
                table: "PrintAreaSizeOptions",
                columns: new[] { "PrintAreaId", "PrintSizeId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PrintAreaSizeOptions_PrintSizeId",
                schema: "teenova",
                table: "PrintAreaSizeOptions",
                column: "PrintSizeId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PrintAreaSizeOptions",
                schema: "teenova");
        }
    }
}
