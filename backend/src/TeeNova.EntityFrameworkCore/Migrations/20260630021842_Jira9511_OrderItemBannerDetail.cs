using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class Jira9511_OrderItemBannerDetail : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OrderItemBannerDetails",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SizeMode = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    SizePresetId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SizeLabel = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    Width = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    Height = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    Unit = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    AreaSquareMetres = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    Material = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    MaterialDisplayName = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    FinishingEyelets = table.Column<bool>(type: "bit", nullable: false),
                    FinishingHemming = table.Column<bool>(type: "bit", nullable: false),
                    FinishingPolePocket = table.Column<bool>(type: "bit", nullable: false),
                    FinishingOther = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: true),
                    StandIncluded = table.Column<bool>(type: "bit", nullable: false),
                    StandReplacementOnly = table.Column<bool>(type: "bit", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderItemBannerDetails", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrderItemBannerDetails_OrderItems_OrderItemId",
                        column: x => x.OrderItemId,
                        principalSchema: "teenova",
                        principalTable: "OrderItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OrderItemBannerDetails_OrderItemId",
                schema: "teenova",
                table: "OrderItemBannerDetails",
                column: "OrderItemId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OrderItemBannerDetails",
                schema: "teenova");
        }
    }
}
