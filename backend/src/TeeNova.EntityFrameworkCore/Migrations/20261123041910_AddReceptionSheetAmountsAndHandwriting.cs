using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddReceptionSheetAmountsAndHandwriting : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "Deposit",
                schema: "teenova",
                table: "ReceptionSheets",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "HandwritingJson",
                schema: "teenova",
                table: "ReceptionSheets",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TotalPrice",
                schema: "teenova",
                table: "ReceptionSheets",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Deposit",
                schema: "teenova",
                table: "ReceptionSheets");

            migrationBuilder.DropColumn(
                name: "HandwritingJson",
                schema: "teenova",
                table: "ReceptionSheets");

            migrationBuilder.DropColumn(
                name: "TotalPrice",
                schema: "teenova",
                table: "ReceptionSheets");
        }
    }
}
