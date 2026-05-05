using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class Add_OrderItemPrint : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // ProductImages.Color, PrintAreas, PrintSizes, and ShippingAddress_State nullability
            // were already applied by prior migrations (AddProductImageColor, AddPrintConfig,
            // MakeShippingAddressStateOptional). Those operations are omitted here to avoid
            // duplicate-column errors caused by missing Designer snapshots on those migrations.

            migrationBuilder.CreateTable(
                name: "OrderItemPrints",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PrintAreaId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PrintSizeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PrintAreaName = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    PrintAreaCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    PrintAreaPrice = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    PrintSizeName = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    PrintSizeCode = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    PrintSizePrice = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderItemPrints", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrderItemPrints_OrderItems_OrderItemId",
                        column: x => x.OrderItemId,
                        principalSchema: "teenova",
                        principalTable: "OrderItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OrderItemPrints_PrintAreas_PrintAreaId",
                        column: x => x.PrintAreaId,
                        principalSchema: "teenova",
                        principalTable: "PrintAreas",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OrderItemPrints_PrintSizes_PrintSizeId",
                        column: x => x.PrintSizeId,
                        principalSchema: "teenova",
                        principalTable: "PrintSizes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OrderItemPrints_OrderItemId",
                schema: "teenova",
                table: "OrderItemPrints",
                column: "OrderItemId");

            migrationBuilder.CreateIndex(
                name: "IX_OrderItemPrints_PrintAreaId",
                schema: "teenova",
                table: "OrderItemPrints",
                column: "PrintAreaId");

            migrationBuilder.CreateIndex(
                name: "IX_OrderItemPrints_PrintSizeId",
                schema: "teenova",
                table: "OrderItemPrints",
                column: "PrintSizeId");

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OrderItemPrints",
                schema: "teenova");
        }
    }
}
