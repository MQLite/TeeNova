using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    public partial class RemoveLegacyOrderItemAssetColumns : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DesignNote",
                schema: "teenova",
                table: "OrderItems");

            migrationBuilder.DropColumn(
                name: "PrintPosition",
                schema: "teenova",
                table: "OrderItems");

            migrationBuilder.DropColumn(
                name: "PrintPositionsJson",
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
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DesignNote",
                schema: "teenova",
                table: "OrderItems",
                type: "nvarchar(2000)",
                maxLength: 2000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PrintPosition",
                schema: "teenova",
                table: "OrderItems",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PrintPositionsJson",
                schema: "teenova",
                table: "OrderItems",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<System.Guid>(
                name: "UploadedAssetId",
                schema: "teenova",
                table: "OrderItems",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UploadedAssetUrl",
                schema: "teenova",
                table: "OrderItems",
                type: "nvarchar(1024)",
                maxLength: 1024,
                nullable: true);
        }
    }
}
