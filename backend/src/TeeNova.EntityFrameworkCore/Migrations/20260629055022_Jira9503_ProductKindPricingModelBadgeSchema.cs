using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class Jira9503_ProductKindPricingModelBadgeSchema : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "DesignUploadRequired",
                schema: "teenova",
                table: "Products",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "Kind",
                schema: "teenova",
                table: "Products",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Garment");

            migrationBuilder.AddColumn<int>(
                name: "MinimumQuantity",
                schema: "teenova",
                table: "Products",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<string>(
                name: "PricingModel",
                schema: "teenova",
                table: "Products",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "GarmentPrint");

            migrationBuilder.AlterColumn<string>(
                name: "VariantLabel",
                schema: "teenova",
                table: "OrderItems",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(128)",
                oldMaxLength: 128);

            migrationBuilder.AlterColumn<Guid>(
                name: "ProductVariantId",
                schema: "teenova",
                table: "OrderItems",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<int>(
                name: "AppliedQuantityTierMinQuantity",
                schema: "teenova",
                table: "OrderItems",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ConfigurationJson",
                schema: "teenova",
                table: "OrderItems",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DesignNote",
                schema: "teenova",
                table: "OrderItems",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PricingModel",
                schema: "teenova",
                table: "OrderItems",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "GarmentPrint");

            migrationBuilder.AddColumn<string>(
                name: "ProductKind",
                schema: "teenova",
                table: "OrderItems",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Garment");

            migrationBuilder.AddColumn<Guid>(
                name: "UploadedAssetId",
                schema: "teenova",
                table: "OrderItems",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UploadedAssetUrl",
                schema: "teenova",
                table: "OrderItems",
                type: "nvarchar(2048)",
                maxLength: 2048,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ProductQuantityPriceTiers",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    MinQuantity = table.Column<int>(type: "int", nullable: false),
                    UnitPrice = table.Column<decimal>(type: "decimal(18,2)", nullable: false),
                    IsActive = table.Column<bool>(type: "bit", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProductQuantityPriceTiers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ProductQuantityPriceTiers_Products_ProductId",
                        column: x => x.ProductId,
                        principalSchema: "teenova",
                        principalTable: "Products",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProductQuantityPriceTiers_ProductId",
                schema: "teenova",
                table: "ProductQuantityPriceTiers",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_ProductQuantityPriceTiers_ProductId_MinQuantity",
                schema: "teenova",
                table: "ProductQuantityPriceTiers",
                columns: new[] { "ProductId", "MinQuantity" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProductQuantityPriceTiers",
                schema: "teenova");

            migrationBuilder.DropColumn(
                name: "DesignUploadRequired",
                schema: "teenova",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "Kind",
                schema: "teenova",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "MinimumQuantity",
                schema: "teenova",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "PricingModel",
                schema: "teenova",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "AppliedQuantityTierMinQuantity",
                schema: "teenova",
                table: "OrderItems");

            migrationBuilder.DropColumn(
                name: "ConfigurationJson",
                schema: "teenova",
                table: "OrderItems");

            migrationBuilder.DropColumn(
                name: "DesignNote",
                schema: "teenova",
                table: "OrderItems");

            migrationBuilder.DropColumn(
                name: "PricingModel",
                schema: "teenova",
                table: "OrderItems");

            migrationBuilder.DropColumn(
                name: "ProductKind",
                schema: "teenova",
                table: "OrderItems");

            migrationBuilder.DropColumn(
                name: "UploadedAssetId",
                schema: "teenova",
                table: "OrderItems");

            migrationBuilder.DropColumn(
                name: "UploadedAssetUrl",
                schema: "teenova",
                table: "OrderItems");

            migrationBuilder.AlterColumn<string>(
                name: "VariantLabel",
                schema: "teenova",
                table: "OrderItems",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(128)",
                oldMaxLength: 128,
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "ProductVariantId",
                schema: "teenova",
                table: "OrderItems",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);
        }
    }
}
