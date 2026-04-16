using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TeeNova.EntityFrameworkCore;

#nullable disable

namespace TeeNova.Migrations
{
    [DbContext(typeof(TeeNovaDbContext))]
    [Migration("20260416133000_AddOrderPreparationChecklist")]
    public partial class AddOrderPreparationChecklist : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "IsDesignReviewed",
                schema: "teenova",
                table: "Orders",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsFileDownloaded",
                schema: "teenova",
                table: "Orders",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsGarmentConfirmed",
                schema: "teenova",
                table: "Orders",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsPrintPositionConfirmed",
                schema: "teenova",
                table: "Orders",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "IsReadyToPrint",
                schema: "teenova",
                table: "Orders",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsDesignReviewed",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "IsFileDownloaded",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "IsGarmentConfirmed",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "IsPrintPositionConfirmed",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "IsReadyToPrint",
                schema: "teenova",
                table: "Orders");
        }
    }
}
