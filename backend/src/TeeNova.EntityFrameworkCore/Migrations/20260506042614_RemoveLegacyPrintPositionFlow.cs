using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class RemoveLegacyPrintPositionFlow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OrderItemPositionAssets",
                schema: "teenova");

            migrationBuilder.DropIndex(
                name: "IX_PrintAreas_LegacyPositionValue",
                schema: "teenova",
                table: "PrintAreas");

            migrationBuilder.DropColumn(
                name: "LegacyPositionValue",
                schema: "teenova",
                table: "PrintAreas");

            migrationBuilder.DropColumn(
                name: "IsPrintPositionConfirmed",
                schema: "teenova",
                table: "Orders");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "LegacyPositionValue",
                schema: "teenova",
                table: "PrintAreas",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsPrintPositionConfirmed",
                schema: "teenova",
                table: "Orders",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.CreateTable(
                name: "OrderItemPositionAssets",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DesignNote = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    OrderItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Position = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    UploadedAssetId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UploadedAssetUrl = table.Column<string>(type: "nvarchar(1024)", maxLength: 1024, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderItemPositionAssets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrderItemPositionAssets_OrderItems_OrderItemId",
                        column: x => x.OrderItemId,
                        principalSchema: "teenova",
                        principalTable: "OrderItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PrintAreas_LegacyPositionValue",
                schema: "teenova",
                table: "PrintAreas",
                column: "LegacyPositionValue",
                unique: true,
                filter: "[LegacyPositionValue] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_OrderItemPositionAssets_OrderItemId_Position",
                schema: "teenova",
                table: "OrderItemPositionAssets",
                columns: new[] { "OrderItemId", "Position" },
                unique: true);
        }
    }
}
