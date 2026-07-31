using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddAiOrderConfirmationMaterialization : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_AiOrderImports_ConfirmationMetadata",
                schema: "teenova",
                table: "AiOrderImports");

            migrationBuilder.AddColumn<DateTime>(
                name: "EvidenceReceivedAt",
                schema: "teenova",
                table: "PaymentTransactions",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SourceAiOrderImportId",
                schema: "teenova",
                table: "PaymentTransactions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "AiCalculatedMaterializationTotal",
                schema: "teenova",
                table: "Orders",
                type: "decimal(18,4)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AiPricingMode",
                schema: "teenova",
                table: "Orders",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "AiPricingReason",
                schema: "teenova",
                table: "Orders",
                type: "nvarchar(1000)",
                maxLength: 1000,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "AiWrittenOrderTotal",
                schema: "teenova",
                table: "Orders",
                type: "decimal(18,4)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Source",
                schema: "teenova",
                table: "Orders",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Checkout");

            migrationBuilder.AddColumn<DateTime>(
                name: "SourceAiOrderConfirmedAt",
                schema: "teenova",
                table: "Orders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SourceAiOrderConfirmedByAdminId",
                schema: "teenova",
                table: "Orders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SourceAiOrderConfirmedCanonicalSha256",
                schema: "teenova",
                table: "Orders",
                type: "nchar(64)",
                fixedLength: true,
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "SourceAiOrderConfirmedRevision",
                schema: "teenova",
                table: "Orders",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SourceAiOrderImportId",
                schema: "teenova",
                table: "Orders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SourceAiOrderMaterializationOperationKey",
                schema: "teenova",
                table: "Orders",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "SourceAiOrderMaterializedAt",
                schema: "teenova",
                table: "Orders",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "SourceAiOrderMaterializedByAdminId",
                schema: "teenova",
                table: "Orders",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "ProductId",
                schema: "teenova",
                table: "OrderItems",
                type: "uniqueidentifier",
                nullable: true,
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier");

            migrationBuilder.AddColumn<string>(
                name: "ColourSnapshot",
                schema: "teenova",
                table: "OrderItems",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "OrderAdHocProductSnapshotId",
                schema: "teenova",
                table: "OrderItems",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProductSource",
                schema: "teenova",
                table: "OrderItems",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "Catalogue");

            migrationBuilder.AddColumn<string>(
                name: "SizeSnapshot",
                schema: "teenova",
                table: "OrderItems",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ConfirmationOperationKey",
                schema: "teenova",
                table: "AiOrderImports",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ConfirmedBlockingIssueCount",
                schema: "teenova",
                table: "AiOrderImports",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ConfirmedCanonicalSha256",
                schema: "teenova",
                table: "AiOrderImports",
                type: "nchar(64)",
                fixedLength: true,
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ConfirmedReviewVersion",
                schema: "teenova",
                table: "AiOrderImports",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ConfirmedRevision",
                schema: "teenova",
                table: "AiOrderImports",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "MaterializationRequestHash",
                schema: "teenova",
                table: "AiOrderImports",
                type: "nchar(64)",
                fixedLength: true,
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "MaterializedAt",
                schema: "teenova",
                table: "AiOrderImports",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "MaterializedByAdminId",
                schema: "teenova",
                table: "AiOrderImports",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.Sql(
                """
                IF EXISTS (
                    SELECT 1
                    FROM [teenova].[AiOrderImports]
                    WHERE [Status] = N'Confirmed'
                )
                BEGIN
                    THROW 51027, 'Jira 10207 cannot backfill immutable confirmation evidence for an existing Confirmed import. Resolve it explicitly before applying this migration.', 1;
                END
                """);

            migrationBuilder.CreateTable(
                name: "OrderAdHocProductSnapshots",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    DisplayName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    WrittenName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Brand = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    SupplierName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    SupplierCode = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    SupplySource = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    InventoryBehavior = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ConfirmedImportGroupId = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    ConfirmedRevision = table.Column<int>(type: "int", nullable: false),
                    PrintingDetailsJson = table.Column<string>(type: "nvarchar(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderAdHocProductSnapshots", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrderAdHocProductSnapshots_Orders_OrderId",
                        column: x => x.OrderId,
                        principalSchema: "teenova",
                        principalTable: "Orders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "UX_PaymentTransactions_SourceAiOrderImportId",
                schema: "teenova",
                table: "PaymentTransactions",
                column: "SourceAiOrderImportId",
                unique: true,
                filter: "[SourceAiOrderImportId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "UX_Orders_AiMaterializationOperationKey",
                schema: "teenova",
                table: "Orders",
                column: "SourceAiOrderMaterializationOperationKey",
                unique: true,
                filter: "[SourceAiOrderMaterializationOperationKey] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "UX_Orders_SourceAiOrderImportId",
                schema: "teenova",
                table: "Orders",
                column: "SourceAiOrderImportId",
                unique: true,
                filter: "[SourceAiOrderImportId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_OrderItems_OrderAdHocProductSnapshotId",
                schema: "teenova",
                table: "OrderItems",
                column: "OrderAdHocProductSnapshotId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_OrderItems_ProductSource",
                schema: "teenova",
                table: "OrderItems",
                sql: "([ProductSource] = 'Catalogue' AND [ProductId] IS NOT NULL AND [OrderAdHocProductSnapshotId] IS NULL) OR ([ProductSource] = 'AdHoc' AND [ProductId] IS NULL AND [OrderAdHocProductSnapshotId] IS NOT NULL AND [InventoryDeductionEligible] = 0)");

            migrationBuilder.CreateIndex(
                name: "UX_AiOrderImports_ConfirmationOperationKey",
                schema: "teenova",
                table: "AiOrderImports",
                column: "ConfirmationOperationKey",
                unique: true,
                filter: "[ConfirmationOperationKey] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiOrderImports_ConfirmationMetadata",
                schema: "teenova",
                table: "AiOrderImports",
                sql: "([Status] <> 'Confirmed') OR ([ConfirmedAt] IS NOT NULL AND [ConfirmedByAdminId] IS NOT NULL AND [ConfirmedRevision] = [CurrentRevision] AND [ConfirmedCanonicalSha256] IS NOT NULL AND [ConfirmedReviewVersion] IS NOT NULL AND [ConfirmedBlockingIssueCount] = 0 AND [ConfirmationOperationKey] IS NOT NULL)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiOrderImports_MaterializationMetadata",
                schema: "teenova",
                table: "AiOrderImports",
                sql: "([FormalOrderId] IS NULL AND [MaterializationOperationKey] IS NULL AND [MaterializationRequestHash] IS NULL AND [MaterializedByAdminId] IS NULL AND [MaterializedAt] IS NULL) OR ([FormalOrderId] IS NOT NULL AND [MaterializationOperationKey] IS NOT NULL AND [MaterializationRequestHash] IS NOT NULL AND [MaterializedByAdminId] IS NOT NULL AND [MaterializedAt] IS NOT NULL)");

            migrationBuilder.CreateIndex(
                name: "UX_OrderAdHocProductSnapshots_Order_Group",
                schema: "teenova",
                table: "OrderAdHocProductSnapshots",
                columns: new[] { "OrderId", "ConfirmedImportGroupId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_OrderItems_OrderAdHocProductSnapshots_OrderAdHocProductSnapshotId",
                schema: "teenova",
                table: "OrderItems",
                column: "OrderAdHocProductSnapshotId",
                principalSchema: "teenova",
                principalTable: "OrderAdHocProductSnapshots",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                IF EXISTS (
                    SELECT 1
                    FROM [teenova].[OrderItems]
                    WHERE [ProductSource] = N'AdHoc'
                )
                BEGIN
                    THROW 51028, 'Rollback is blocked because Ad-hoc OrderItems cannot be converted honestly to catalogue ProductIds.', 1;
                END
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_OrderItems_OrderAdHocProductSnapshots_OrderAdHocProductSnapshotId",
                schema: "teenova",
                table: "OrderItems");

            migrationBuilder.DropTable(
                name: "OrderAdHocProductSnapshots",
                schema: "teenova");

            migrationBuilder.DropIndex(
                name: "UX_PaymentTransactions_SourceAiOrderImportId",
                schema: "teenova",
                table: "PaymentTransactions");

            migrationBuilder.DropIndex(
                name: "UX_Orders_AiMaterializationOperationKey",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "UX_Orders_SourceAiOrderImportId",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropIndex(
                name: "IX_OrderItems_OrderAdHocProductSnapshotId",
                schema: "teenova",
                table: "OrderItems");

            migrationBuilder.DropCheckConstraint(
                name: "CK_OrderItems_ProductSource",
                schema: "teenova",
                table: "OrderItems");

            migrationBuilder.DropIndex(
                name: "UX_AiOrderImports_ConfirmationOperationKey",
                schema: "teenova",
                table: "AiOrderImports");

            migrationBuilder.DropCheckConstraint(
                name: "CK_AiOrderImports_ConfirmationMetadata",
                schema: "teenova",
                table: "AiOrderImports");

            migrationBuilder.DropCheckConstraint(
                name: "CK_AiOrderImports_MaterializationMetadata",
                schema: "teenova",
                table: "AiOrderImports");

            migrationBuilder.DropColumn(
                name: "EvidenceReceivedAt",
                schema: "teenova",
                table: "PaymentTransactions");

            migrationBuilder.DropColumn(
                name: "SourceAiOrderImportId",
                schema: "teenova",
                table: "PaymentTransactions");

            migrationBuilder.DropColumn(
                name: "AiCalculatedMaterializationTotal",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "AiPricingMode",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "AiPricingReason",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "AiWrittenOrderTotal",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "Source",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "SourceAiOrderConfirmedAt",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "SourceAiOrderConfirmedByAdminId",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "SourceAiOrderConfirmedCanonicalSha256",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "SourceAiOrderConfirmedRevision",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "SourceAiOrderImportId",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "SourceAiOrderMaterializationOperationKey",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "SourceAiOrderMaterializedAt",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "SourceAiOrderMaterializedByAdminId",
                schema: "teenova",
                table: "Orders");

            migrationBuilder.DropColumn(
                name: "ColourSnapshot",
                schema: "teenova",
                table: "OrderItems");

            migrationBuilder.DropColumn(
                name: "OrderAdHocProductSnapshotId",
                schema: "teenova",
                table: "OrderItems");

            migrationBuilder.DropColumn(
                name: "ProductSource",
                schema: "teenova",
                table: "OrderItems");

            migrationBuilder.DropColumn(
                name: "SizeSnapshot",
                schema: "teenova",
                table: "OrderItems");

            migrationBuilder.DropColumn(
                name: "ConfirmationOperationKey",
                schema: "teenova",
                table: "AiOrderImports");

            migrationBuilder.DropColumn(
                name: "ConfirmedBlockingIssueCount",
                schema: "teenova",
                table: "AiOrderImports");

            migrationBuilder.DropColumn(
                name: "ConfirmedCanonicalSha256",
                schema: "teenova",
                table: "AiOrderImports");

            migrationBuilder.DropColumn(
                name: "ConfirmedReviewVersion",
                schema: "teenova",
                table: "AiOrderImports");

            migrationBuilder.DropColumn(
                name: "ConfirmedRevision",
                schema: "teenova",
                table: "AiOrderImports");

            migrationBuilder.DropColumn(
                name: "MaterializationRequestHash",
                schema: "teenova",
                table: "AiOrderImports");

            migrationBuilder.DropColumn(
                name: "MaterializedAt",
                schema: "teenova",
                table: "AiOrderImports");

            migrationBuilder.DropColumn(
                name: "MaterializedByAdminId",
                schema: "teenova",
                table: "AiOrderImports");

            migrationBuilder.AlterColumn<Guid>(
                name: "ProductId",
                schema: "teenova",
                table: "OrderItems",
                type: "uniqueidentifier",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"),
                oldClrType: typeof(Guid),
                oldType: "uniqueidentifier",
                oldNullable: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiOrderImports_ConfirmationMetadata",
                schema: "teenova",
                table: "AiOrderImports",
                sql: "([Status] <> 'Confirmed') OR ([ConfirmedAt] IS NOT NULL AND [ConfirmedByAdminId] IS NOT NULL AND [CurrentRevision] > 0)");
        }
    }
}
