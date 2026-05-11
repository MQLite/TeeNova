using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class DropOrderPreparationChecklistColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
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
                name: "IsReadyToPrint",
                schema: "teenova",
                table: "Orders");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
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
                name: "IsReadyToPrint",
                schema: "teenova",
                table: "Orders",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }
    }
}
