using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentTransactionIdToEmailNotificationLogs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "PaymentTransactionId",
                schema: "teenova",
                table: "EmailNotificationLogs",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_EmailNotificationLogs_PaymentTransactionId",
                schema: "teenova",
                table: "EmailNotificationLogs",
                column: "PaymentTransactionId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_EmailNotificationLogs_PaymentTransactionId",
                schema: "teenova",
                table: "EmailNotificationLogs");

            migrationBuilder.DropColumn(
                name: "PaymentTransactionId",
                schema: "teenova",
                table: "EmailNotificationLogs");
        }
    }
}
