using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class Jira10301_GeneralQuoteRequests : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "QuoteRequests",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Reference = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    ServiceType = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    ServiceTypeOther = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    ProductId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ProductNameSnapshot = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    Quantity = table.Column<int>(type: "int", nullable: true),
                    Width = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    Height = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    DimensionUnit = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: true),
                    RequiredDate = table.Column<DateTime>(type: "date", nullable: true),
                    FulfilmentPreference = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    DeliverySuburb = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: true),
                    CustomerName = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    CustomerEmail = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    CustomerPhone = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: true),
                    OrganisationName = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    SubmissionHash = table.Column<string>(type: "nchar(64)", fixedLength: true, maxLength: 64, nullable: false),
                    SubmissionKey = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    SourcePath = table.Column<string>(type: "nvarchar(200)", maxLength: 200, nullable: true),
                    ClientIpHash = table.Column<string>(type: "nchar(64)", fixedLength: true, maxLength: 64, nullable: true),
                    InternalNotificationStatus = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    CustomerAcknowledgementStatus = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    ExtraProperties = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    ConcurrencyStamp = table.Column<string>(type: "nvarchar(40)", maxLength: 40, nullable: false),
                    CreationTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    LastModificationTime = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LastModifierId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: false, defaultValue: false),
                    DeleterId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    DeletionTime = table.Column<DateTime>(type: "datetime2", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuoteRequests", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "QuoteRequestAttachments",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    QuoteRequestId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ObjectKey = table.Column<string>(type: "nvarchar(400)", maxLength: 400, nullable: false),
                    OriginalFileName = table.Column<string>(type: "nvarchar(260)", maxLength: 260, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(120)", maxLength: 120, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    Sha256 = table.Column<string>(type: "nchar(64)", fixedLength: true, maxLength: 64, nullable: false),
                    UploadTokenHash = table.Column<string>(type: "nchar(64)", fixedLength: true, maxLength: 64, nullable: false),
                    StagedUntil = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ScanStatus = table.Column<string>(type: "nvarchar(24)", maxLength: 24, nullable: false),
                    CreationTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QuoteRequestAttachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QuoteRequestAttachments_QuoteRequests_QuoteRequestId",
                        column: x => x.QuoteRequestId,
                        principalSchema: "teenova",
                        principalTable: "QuoteRequests",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_QuoteRequestAttachments_QuoteRequestId_CreationTime",
                schema: "teenova",
                table: "QuoteRequestAttachments",
                columns: new[] { "QuoteRequestId", "CreationTime" });

            migrationBuilder.CreateIndex(
                name: "IX_QuoteRequestAttachments_StagedUntil",
                schema: "teenova",
                table: "QuoteRequestAttachments",
                column: "StagedUntil",
                filter: "[QuoteRequestId] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_QuoteRequestAttachments_UploadTokenHash",
                schema: "teenova",
                table: "QuoteRequestAttachments",
                column: "UploadTokenHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_QuoteRequests_Reference",
                schema: "teenova",
                table: "QuoteRequests",
                column: "Reference",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_QuoteRequests_Status_CreationTime",
                schema: "teenova",
                table: "QuoteRequests",
                columns: new[] { "Status", "CreationTime" });

            migrationBuilder.CreateIndex(
                name: "IX_QuoteRequests_SubmissionHash_CreationTime",
                schema: "teenova",
                table: "QuoteRequests",
                columns: new[] { "SubmissionHash", "CreationTime" });

            migrationBuilder.CreateIndex(
                name: "IX_QuoteRequests_SubmissionKey",
                schema: "teenova",
                table: "QuoteRequests",
                column: "SubmissionKey",
                unique: true,
                filter: "[SubmissionKey] IS NOT NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "QuoteRequestAttachments",
                schema: "teenova");

            migrationBuilder.DropTable(
                name: "QuoteRequests",
                schema: "teenova");
        }
    }
}
