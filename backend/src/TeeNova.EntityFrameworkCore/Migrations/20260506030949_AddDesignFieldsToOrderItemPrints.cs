using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddDesignFieldsToOrderItemPrints : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DesignNote",
                schema: "teenova",
                table: "OrderItemPrints",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "UploadedAssetId",
                schema: "teenova",
                table: "OrderItemPrints",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UploadedAssetUrl",
                schema: "teenova",
                table: "OrderItemPrints",
                type: "nvarchar(1024)",
                maxLength: 1024,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DesignNote",
                schema: "teenova",
                table: "OrderItemPrints");

            migrationBuilder.DropColumn(
                name: "UploadedAssetId",
                schema: "teenova",
                table: "OrderItemPrints");

            migrationBuilder.DropColumn(
                name: "UploadedAssetUrl",
                schema: "teenova",
                table: "OrderItemPrints");
        }
    }
}
