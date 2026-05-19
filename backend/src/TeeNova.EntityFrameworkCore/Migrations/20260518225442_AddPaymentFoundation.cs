using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentFoundation : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "BalanceAmount",
                schema: "teenova",
                table: "Orders",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<DateTime>(
                name: "DepositPaidAt",
                schema: "teenova",
                table: "Orders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "FullyPaidAt",
                schema: "teenova",
                table: "Orders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LastPaymentMethod",
                schema: "teenova",
                table: "Orders",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LastPaymentNote",
                schema: "teenova",
                table: "Orders",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "LastPaymentReference",
                schema: "teenova",
                table: "Orders",
                type: "nvarchar(256)",
                maxLength: 256,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "PaidAmount",
                schema: "teenova",
                table: "Orders",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "PaymentRequirementType",
                schema: "teenova",
                table: "Orders",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "PaymentStatus",
                schema: "teenova",
                table: "Orders",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Unpaid");

            migrationBuilder.AddColumn<decimal>(
                name: "RequiredDepositAmount",
                schema: "teenova",
                table: "Orders",
                type: "decimal(18,4)",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "RequiredPaymentAmount",
                schema: "teenova",
                table: "Orders",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateTable(
                name: "PaymentTransactions",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(18,4)", nullable: false),
                    Method = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    Note = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    CreationTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PaymentTransactions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Orders_PaymentStatus",
                schema: "teenova",
                table: "Orders",
                column: "PaymentStatus");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentTransactions_OrderId",
                schema: "teenova",
                table: "PaymentTransactions",
                column: "OrderId");

            // ── Data backfill ──────────────────────────────────────────────────────
            // Existing rows received column defaults above; now set correct values
            // based on their current Status and DeliveryMethod.
            // Only non-deleted rows are backfilled; soft-deleted rows are never loaded
            // by the application so their placeholder defaults are harmless.
            // CEILING(TotalAmount * 0.50 * 100) / 100 rounds up to the nearest cent.

            // Orders already activated or completed → treat as fully paid
            migrationBuilder.Sql(@"
UPDATE [teenova].[Orders]
SET
    PaymentStatus          = 'Paid',
    PaymentRequirementType = CASE WHEN DeliveryMethod = 'Pickup' THEN 'DepositThenBalance' ELSE 'FullPaymentRequired' END,
    RequiredDepositAmount  = CASE WHEN DeliveryMethod = 'Pickup' THEN CAST(CEILING(TotalAmount * 0.50 * 100) / 100 AS decimal(18,4)) ELSE NULL END,
    RequiredPaymentAmount  = TotalAmount,
    PaidAmount             = TotalAmount,
    BalanceAmount          = 0,
    FullyPaidAt            = COALESCE(LastModificationTime, CreationTime, GETUTCDATE())
WHERE Status IN ('Paid', 'Reviewing', 'Printing', 'Ready', 'Completed')
  AND IsDeleted = 0;
");

            // Pending orders → awaiting deposit or full payment
            migrationBuilder.Sql(@"
UPDATE [teenova].[Orders]
SET
    PaymentStatus          = CASE WHEN DeliveryMethod = 'Pickup' THEN 'DepositRequired' ELSE 'Unpaid' END,
    PaymentRequirementType = CASE WHEN DeliveryMethod = 'Pickup' THEN 'DepositThenBalance' ELSE 'FullPaymentRequired' END,
    RequiredDepositAmount  = CASE WHEN DeliveryMethod = 'Pickup' THEN CAST(CEILING(TotalAmount * 0.50 * 100) / 100 AS decimal(18,4)) ELSE NULL END,
    RequiredPaymentAmount  = TotalAmount,
    PaidAmount             = 0,
    BalanceAmount          = TotalAmount
WHERE Status = 'Pending'
  AND IsDeleted = 0;
");

            // Cancelled orders → unpaid with correct requirement type
            migrationBuilder.Sql(@"
UPDATE [teenova].[Orders]
SET
    PaymentStatus          = 'Unpaid',
    PaymentRequirementType = CASE WHEN DeliveryMethod = 'Pickup' THEN 'DepositThenBalance' ELSE 'FullPaymentRequired' END,
    RequiredDepositAmount  = CASE WHEN DeliveryMethod = 'Pickup' THEN CAST(CEILING(TotalAmount * 0.50 * 100) / 100 AS decimal(18,4)) ELSE NULL END,
    RequiredPaymentAmount  = TotalAmount,
    PaidAmount             = 0,
    BalanceAmount          = TotalAmount
WHERE Status = 'Cancelled'
  AND IsDeleted = 0;
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PaymentTransactions",
                schema: "teenova");

            migrationBuilder.DropIndex(
                name: "IX_Orders_PaymentStatus",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "BalanceAmount",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "DepositPaidAt",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "FullyPaidAt",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "LastPaymentMethod",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "LastPaymentNote",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "LastPaymentReference",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "PaidAmount",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "PaymentRequirementType",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "PaymentStatus",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "RequiredDepositAmount",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "RequiredPaymentAmount",
                schema: "teenova",
                table: "Orders");
        }
    }
}
