using System;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TeeNova.EntityFrameworkCore;

[DbContext(typeof(TeeNovaDbContext))]
[Migration("20260416120000_AddPrintingPhase")]
public partial class AddPrintingPhase : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Add IsApprovedForPrinting column to Orders
        migrationBuilder.AddColumn<bool>(
            name: "IsApprovedForPrinting",
            schema: "teenova",
            table: "Orders",
            type: "bit",
            nullable: false,
            defaultValue: false);

        // Create OrderTimelineEntries table
        migrationBuilder.CreateTable(
            name: "OrderTimelineEntries",
            schema: "teenova",
            columns: table => new
            {
                Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                EventType = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                Description = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: false),
                CreationTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                CreatorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_OrderTimelineEntries", x => x.Id);
            });

        migrationBuilder.CreateIndex(
            name: "IX_OrderTimelineEntries_OrderId",
            schema: "teenova",
            table: "OrderTimelineEntries",
            column: "OrderId");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "OrderTimelineEntries",
            schema: "teenova");

        migrationBuilder.DropColumn(
            name: "IsApprovedForPrinting",
            schema: "teenova",
            table: "Orders");
    }
}
