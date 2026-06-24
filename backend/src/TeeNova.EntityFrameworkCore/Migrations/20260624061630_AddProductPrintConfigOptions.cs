using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddProductPrintConfigOptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ProductPrintConfigOptions",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Size = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    PrintAreaId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PrintSizeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductPrintConfigOptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProductPrintConfigOptions_Products_ProductId",
                        column: x => x.ProductId,
                        principalSchema: "teenova",
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProductPrintConfigOptions_ProductId",
                schema: "teenova",
                table: "ProductPrintConfigOptions",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductPrintConfigOptions_ProductId_Size_PrintAreaId_PrintSizeId",
                schema: "teenova",
                table: "ProductPrintConfigOptions",
                columns: new[] { "ProductId", "Size", "PrintAreaId", "PrintSizeId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProductPrintConfigOptions",
                schema: "teenova");
        }
    }
}
