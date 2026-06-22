using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddVariantInventoryFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<int>(
                name: "StockQuantity",
                schema: "teenova",
                table: "ProductVariants",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AddColumn<string>(
                name: "InventoryNote",
                schema: "teenova",
                table: "ProductVariants",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "InventoryStatus",
                schema: "teenova",
                table: "ProductVariants",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "InventoryUpdatedAt",
                schema: "teenova",
                table: "ProductVariants",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InventoryUpdatedBy",
                schema: "teenova",
                table: "ProductVariants",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "LowStockThreshold",
                schema: "teenova",
                table: "ProductVariants",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "InventoryDeductedAt",
                schema: "teenova",
                table: "OrderItems",
                type: "datetime2",
                nullable: true);

            // Backfill (Jira 9002): every existing variant becomes NotRecorded (InventoryStatus
            // default 0 above), so any pre-existing StockQuantity (e.g. seeded values) is cleared
            // to null to honour the rule "NotRecorded => StockQuantity is null".
            migrationBuilder.Sql(
                "UPDATE [teenova].[ProductVariants] SET [StockQuantity] = NULL;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "InventoryNote",
                schema: "teenova",
                table: "ProductVariants");

            migrationBuilder.DropColumn(
                name: "InventoryStatus",
                schema: "teenova",
                table: "ProductVariants");

            migrationBuilder.DropColumn(
                name: "InventoryUpdatedAt",
                schema: "teenova",
                table: "ProductVariants");

            migrationBuilder.DropColumn(
                name: "InventoryUpdatedBy",
                schema: "teenova",
                table: "ProductVariants");

            migrationBuilder.DropColumn(
                name: "LowStockThreshold",
                schema: "teenova",
                table: "ProductVariants");

            migrationBuilder.DropColumn(
                name: "InventoryDeductedAt",
                schema: "teenova",
                table: "OrderItems");

            migrationBuilder.AlterColumn<int>(
                name: "StockQuantity",
                schema: "teenova",
                table: "ProductVariants",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);
        }
    }
}
