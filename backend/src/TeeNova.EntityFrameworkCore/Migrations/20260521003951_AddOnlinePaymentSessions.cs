using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddOnlinePaymentSessions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OnlinePaymentSessions",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderNumber = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    Provider = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ProviderSessionId = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    ProviderCheckoutUrl = table.Column<string>(type: "nvarchar(2048)", maxLength: 2048, nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    Purpose = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ProviderPaymentId = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    LastProviderEventId = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    RawProviderStatus = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    PaymentTransactionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CreationTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OnlinePaymentSessions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OnlinePaymentSessions_LastProviderEventId",
                schema: "teenova",
                table: "OnlinePaymentSessions",
                column: "LastProviderEventId");

            migrationBuilder.CreateIndex(
                name: "IX_OnlinePaymentSessions_OrderId",
                schema: "teenova",
                table: "OnlinePaymentSessions",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_OnlinePaymentSessions_ProviderPaymentId",
                schema: "teenova",
                table: "OnlinePaymentSessions",
                column: "ProviderPaymentId");

            migrationBuilder.CreateIndex(
                name: "IX_OnlinePaymentSessions_ProviderSessionId",
                schema: "teenova",
                table: "OnlinePaymentSessions",
                column: "ProviderSessionId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OnlinePaymentSessions_Status",
                schema: "teenova",
                table: "OnlinePaymentSessions",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OnlinePaymentSessions",
                schema: "teenova");
        }
    }
}
