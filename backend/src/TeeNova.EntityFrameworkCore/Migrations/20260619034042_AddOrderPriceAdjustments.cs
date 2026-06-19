using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderPriceAdjustments : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OrderPriceAdjustments",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OldTotalAmount = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    NewTotalAmount = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    AdjustmentAmount = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: false),
                    AdjustedByUser = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    CreationTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderPriceAdjustments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrderPriceAdjustments_Orders_OrderId",
                        column: x => x.OrderId,
                        principalSchema: "teenova",
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OrderPriceAdjustments_OrderId",
                schema: "teenova",
                table: "OrderPriceAdjustments",
                column: "OrderId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OrderPriceAdjustments",
                schema: "teenova");
        }
    }
}
