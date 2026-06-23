using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddProductPriceTiers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "ProductPriceTiers",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductVariantId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    MinQuantity = table.Column<int>(type: "int", nullable: false),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,2)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductPriceTiers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProductPriceTiers_Products_ProductId",
                        column: x => x.ProductId,
                        principalSchema: "teenova",
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProductPriceTiers_ProductId",
                schema: "teenova",
                table: "ProductPriceTiers",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductPriceTiers_ProductId_ProductVariantId_MinQuantity",
                schema: "teenova",
                table: "ProductPriceTiers",
                columns: new[] { "ProductId", "ProductVariantId", "MinQuantity" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProductPriceTiers",
                schema: "teenova");
        }
    }
}
