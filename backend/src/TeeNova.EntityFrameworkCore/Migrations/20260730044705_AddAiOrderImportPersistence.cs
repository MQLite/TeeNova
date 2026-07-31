using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddAiOrderImportPersistence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AiOrderImports",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ContractVersion = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    CurrentRevision = table.Column<int>(type: "int", nullable: false),
                    CreatedByAdminId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    IdempotencyKey = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    RequestHash = table.Column<string>(type: "nchar(64)", fixedLength: true, maxLength: 64, nullable: false),
                    ActiveProcessingLeaseToken = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    ActiveProcessingLeaseExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    NextRetryAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ConfirmedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ConfirmedByAdminId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    CancelledAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CancelledByAdminId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    FormalOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    MaterializationOperationKey = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    RetentionClass = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    RetentionUntil = table.Column<DateTime>(type: "datetime2", nullable: true),
                    IsRetentionHeld = table.Column<bool>(type: "bit", nullable: false),
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
                    table.PrimaryKey("PK_AiOrderImports", x => x.Id);
                    table.CheckConstraint("CK_AiOrderImports_CancellationMetadata", "([Status] <> 'Cancelled') OR ([CancelledAt] IS NOT NULL AND [CancelledByAdminId] IS NOT NULL)");
                    table.CheckConstraint("CK_AiOrderImports_ConfirmationMetadata", "([Status] <> 'Confirmed') OR ([ConfirmedAt] IS NOT NULL AND [ConfirmedByAdminId] IS NOT NULL AND [CurrentRevision] > 0)");
                    table.CheckConstraint("CK_AiOrderImports_CurrentRevision", "[CurrentRevision] >= 0");
                    table.CheckConstraint("CK_AiOrderImports_ProcessingLease", "([Status] <> 'Processing') OR ([ActiveProcessingLeaseToken] IS NOT NULL AND [ActiveProcessingLeaseExpiresAt] IS NOT NULL)");
                });

            migrationBuilder.CreateTable(
                name: "AiOrderImportRevisions",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ImportId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Revision = table.Column<int>(type: "int", nullable: false),
                    ContractVersion = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ValidationVersion = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    CanonicalJson = table.Column<string>(type: "nvarchar(max)", nullable: false),
                    CanonicalSha256 = table.Column<string>(type: "nchar(64)", fixedLength: true, maxLength: 64, nullable: false),
                    Source = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ActorAdminId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RecordedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreationTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiOrderImportRevisions", x => x.Id);
                    table.CheckConstraint("CK_AiOrderImportRevisions_Revision", "[Revision] > 0");
                    table.ForeignKey(
                        name: "FK_AiOrderImportRevisions_AiOrderImports_ImportId",
                        column: x => x.ImportId,
                        principalSchema: "teenova",
                        principalTable: "AiOrderImports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AiOrderProcessingAttempts",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ImportId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AttemptNumber = table.Column<int>(type: "int", nullable: false),
                    LeaseToken = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Provider = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    Model = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    ProviderRequestId = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    Outcome = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    SafeErrorCode = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    IsRetryable = table.Column<bool>(type: "bit", nullable: true),
                    NextRetryAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    RawResultObjectKey = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: true),
                    RawResultSha256 = table.Column<string>(type: "nchar(64)", fixedLength: true, maxLength: 64, nullable: true),
                    InputTokenCount = table.Column<long>(type: "bigint", nullable: true),
                    OutputTokenCount = table.Column<long>(type: "bigint", nullable: true),
                    CreationTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiOrderProcessingAttempts", x => x.Id);
                    table.CheckConstraint("CK_AiOrderProcessingAttempts_AttemptNumber", "[AttemptNumber] > 0");
                    table.CheckConstraint("CK_AiOrderProcessingAttempts_TokenCounts", "([InputTokenCount] IS NULL OR [InputTokenCount] >= 0) AND ([OutputTokenCount] IS NULL OR [OutputTokenCount] >= 0)");
                    table.ForeignKey(
                        name: "FK_AiOrderProcessingAttempts_AiOrderImports_ImportId",
                        column: x => x.ImportId,
                        principalSchema: "teenova",
                        principalTable: "AiOrderImports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AiOrderReviewEvents",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ImportId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FromRevision = table.Column<int>(type: "int", nullable: true),
                    ToRevision = table.Column<int>(type: "int", nullable: false),
                    Action = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    JsonPointer = table.Column<string>(type: "nvarchar(1024)", maxLength: 1024, nullable: true),
                    BeforeJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    AfterJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Reason = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ActorAdminId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    RecordedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreationTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiOrderReviewEvents", x => x.Id);
                    table.CheckConstraint("CK_AiOrderReviewEvents_Revisions", "[ToRevision] > 0 AND ([FromRevision] IS NULL OR ([FromRevision] > 0 AND [FromRevision] <= [ToRevision]))");
                    table.ForeignKey(
                        name: "FK_AiOrderReviewEvents_AiOrderImports_ImportId",
                        column: x => x.ImportId,
                        principalSchema: "teenova",
                        principalTable: "AiOrderImports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "AiOrderSourceDocuments",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ImportId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Sequence = table.Column<int>(type: "int", nullable: false),
                    CaptureMethod = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    PrivateObjectKey = table.Column<string>(type: "nvarchar(160)", maxLength: 160, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    ByteSize = table.Column<long>(type: "bigint", nullable: false),
                    PageCount = table.Column<int>(type: "int", nullable: true),
                    Sha256 = table.Column<string>(type: "nchar(64)", fixedLength: true, maxLength: 64, nullable: false),
                    OriginalFileName = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: true),
                    UploadedByAdminId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    UploadedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    RetentionUntil = table.Column<DateTime>(type: "datetime2", nullable: true),
                    ContentDeletedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    DeletionOutcome = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    SafeDeletionErrorCode = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    CreationTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiOrderSourceDocuments", x => x.Id);
                    table.CheckConstraint("CK_AiOrderSourceDocuments_ByteSize", "[ByteSize] >= 0");
                    table.CheckConstraint("CK_AiOrderSourceDocuments_PageCount", "[PageCount] IS NULL OR [PageCount] > 0");
                    table.CheckConstraint("CK_AiOrderSourceDocuments_Sequence", "[Sequence] > 0");
                    table.ForeignKey(
                        name: "FK_AiOrderSourceDocuments_AiOrderImports_ImportId",
                        column: x => x.ImportId,
                        principalSchema: "teenova",
                        principalTable: "AiOrderImports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderImportRevisions_CanonicalSha256",
                schema: "teenova",
                table: "AiOrderImportRevisions",
                column: "CanonicalSha256");

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderImportRevisions_ImportId_Revision",
                schema: "teenova",
                table: "AiOrderImportRevisions",
                columns: new[] { "ImportId", "Revision" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderImportRevisions_RecordedAt",
                schema: "teenova",
                table: "AiOrderImportRevisions",
                column: "RecordedAt");

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderImports_CreationTime",
                schema: "teenova",
                table: "AiOrderImports",
                column: "CreationTime");

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderImports_RetentionUntil",
                schema: "teenova",
                table: "AiOrderImports",
                column: "RetentionUntil");

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderImports_Status_NextRetryAt",
                schema: "teenova",
                table: "AiOrderImports",
                columns: new[] { "Status", "NextRetryAt" });

            migrationBuilder.CreateIndex(
                name: "UX_AiOrderImports_ActiveLeaseToken",
                schema: "teenova",
                table: "AiOrderImports",
                column: "ActiveProcessingLeaseToken",
                unique: true,
                filter: "[ActiveProcessingLeaseToken] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "UX_AiOrderImports_Admin_IdempotencyKey",
                schema: "teenova",
                table: "AiOrderImports",
                columns: new[] { "CreatedByAdminId", "IdempotencyKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "UX_AiOrderImports_FormalOrderId",
                schema: "teenova",
                table: "AiOrderImports",
                column: "FormalOrderId",
                unique: true,
                filter: "[FormalOrderId] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "UX_AiOrderImports_MaterializationOperationKey",
                schema: "teenova",
                table: "AiOrderImports",
                column: "MaterializationOperationKey",
                unique: true,
                filter: "[MaterializationOperationKey] IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderProcessingAttempts_ImportId_AttemptNumber",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                columns: new[] { "ImportId", "AttemptNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderProcessingAttempts_LeaseToken",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                column: "LeaseToken",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderProcessingAttempts_NextRetryAt",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                column: "NextRetryAt");

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderProcessingAttempts_ProviderRequestId",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                column: "ProviderRequestId");

            migrationBuilder.CreateIndex(
                name: "UX_AiOrderProcessingAttempts_ActiveImport",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                column: "ImportId",
                unique: true,
                filter: "[Outcome] = 'Processing'");

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderReviewEvents_ImportId_ToRevision",
                schema: "teenova",
                table: "AiOrderReviewEvents",
                columns: new[] { "ImportId", "ToRevision" });

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderReviewEvents_RecordedAt",
                schema: "teenova",
                table: "AiOrderReviewEvents",
                column: "RecordedAt");

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderSourceDocuments_ContentDeletedAt",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                column: "ContentDeletedAt");

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderSourceDocuments_ImportId_Sequence",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                columns: new[] { "ImportId", "Sequence" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderSourceDocuments_PrivateObjectKey",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                column: "PrivateObjectKey",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderSourceDocuments_RetentionUntil",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                column: "RetentionUntil");

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderSourceDocuments_Sha256",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                column: "Sha256");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AiOrderImportRevisions",
                schema: "teenova");

            migrationBuilder.DropTable(
                name: "AiOrderProcessingAttempts",
                schema: "teenova");

            migrationBuilder.DropTable(
                name: "AiOrderReviewEvents",
                schema: "teenova");

            migrationBuilder.DropTable(
                name: "AiOrderSourceDocuments",
                schema: "teenova");

            migrationBuilder.DropTable(
                name: "AiOrderImports",
                schema: "teenova");
        }
    }
}
