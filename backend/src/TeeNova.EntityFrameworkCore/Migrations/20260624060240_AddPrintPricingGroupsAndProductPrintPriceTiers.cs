using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddPrintPricingGroupsAndProductPrintPriceTiers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PrintPricingGroupId",
                schema: "teenova",
                table: "Products",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "AppliedPrintTierMinQuantity",
                schema: "teenova",
                table: "OrderItemPrints",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ResolvedUnitPrintPrice",
                schema: "teenova",
                table: "OrderItemPrints",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateTable(
                name: "PrintPricingGroups",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Code = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PrintPricingGroups", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ProductPrintPriceTiers",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PrintPricingGroupId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Size = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    PrintSizeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MinQuantity = table.Column<int>(type: "int", nullable: false),
                    UnitPrintPrice = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductPrintPriceTiers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProductPrintPriceTiers_PrintPricingGroups_PrintPricingGroupId",
                        column: x => x.PrintPricingGroupId,
                        principalSchema: "teenova",
                        principalTable: "PrintPricingGroups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Products_PrintPricingGroupId",
                schema: "teenova",
                table: "Products",
                column: "PrintPricingGroupId");

            migrationBuilder.CreateIndex(
                name: "IX_PrintPricingGroups_Code",
                schema: "teenova",
                table: "PrintPricingGroups",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ProductPrintPriceTiers_PrintPricingGroupId",
                schema: "teenova",
                table: "ProductPrintPriceTiers",
                column: "PrintPricingGroupId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductPrintPriceTiers_PrintPricingGroupId_Size_PrintSizeId_MinQuantity",
                schema: "teenova",
                table: "ProductPrintPriceTiers",
                columns: new[] { "PrintPricingGroupId", "Size", "PrintSizeId", "MinQuantity" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProductPrintPriceTiers",
                schema: "teenova");

            migrationBuilder.DropTable(
                name: "PrintPricingGroups",
                schema: "teenova");

            migrationBuilder.DropIndex(
                name: "IX_Products_PrintPricingGroupId",
                schema: "teenova",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "PrintPricingGroupId",
                schema: "teenova",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "AppliedPrintTierMinQuantity",
                schema: "teenova",
                table: "OrderItemPrints");

            migrationBuilder.DropColumn(
                name: "ResolvedUnitPrintPrice",
                schema: "teenova",
                table: "OrderItemPrints");
        }
    }
}
