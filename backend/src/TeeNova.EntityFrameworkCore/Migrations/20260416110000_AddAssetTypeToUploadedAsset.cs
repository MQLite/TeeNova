using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TeeNova.EntityFrameworkCore;

#nullable disable

namespace TeeNova.Migrations
{
    [DbContext(typeof(TeeNovaDbContext))]
    [Migration("20260416110000_AddAssetTypeToUploadedAsset")]
    public partial class AddAssetTypeToUploadedAsset : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "AssetType",
                schema: "teenova",
                table: "UploadedAssets",
                type: "int",
                nullable: false,
                defaultValue: 0);  // 0 = CustomerDesign — existing rows are all customer designs
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AssetType",
                schema: "teenova",
                table: "UploadedAssets");
        }
    }
}
