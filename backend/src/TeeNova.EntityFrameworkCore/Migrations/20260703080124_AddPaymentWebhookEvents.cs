using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentWebhookEvents : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PaymentWebhookEvents",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Provider = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ProviderEventId = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    ProviderEventType = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    ProviderSessionId = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    PaymentIntentId = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    OnlinePaymentSessionId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    Amount = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    Currency = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: true),
                    RejectionCode = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    RequiresManualReview = table.Column<bool>(type: "bit", nullable: false),
                    Message = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: true),
                    ReceivedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ProcessedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LastSeenAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    DuplicateCount = table.Column<int>(type: "int", nullable: false),
                    CreationTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentWebhookEvents", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentWebhookEvents_OrderId",
                schema: "teenova",
                table: "PaymentWebhookEvents",
                column: "OrderId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentWebhookEvents_Provider_ProviderEventId",
                schema: "teenova",
                table: "PaymentWebhookEvents",
                columns: new[] { "Provider", "ProviderEventId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PaymentWebhookEvents_ProviderSessionId",
                schema: "teenova",
                table: "PaymentWebhookEvents",
                column: "ProviderSessionId");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentWebhookEvents_RequiresManualReview",
                schema: "teenova",
                table: "PaymentWebhookEvents",
                column: "RequiresManualReview");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentWebhookEvents_Status",
                schema: "teenova",
                table: "PaymentWebhookEvents",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PaymentWebhookEvents",
                schema: "teenova");
        }
    }
}
