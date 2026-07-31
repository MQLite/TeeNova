using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddAiOrderOperationsHardening : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "DeletionFailureCount",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletionNextRetryAt",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RawResultDeletionFailureCount",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<DateTime>(
                name: "RawResultDeletionNextRetryAt",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RawResultDeletionSafeErrorCode",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RetentionHoldExpiresAt",
                schema: "teenova",
                table: "AiOrderImports",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RetentionHoldPlacedAt",
                schema: "teenova",
                table: "AiOrderImports",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "RetentionHoldPlacedByAdminId",
                schema: "teenova",
                table: "AiOrderImports",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "RetentionHoldReason",
                schema: "teenova",
                table: "AiOrderImports",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AiOrderOperationalEvents",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ImportId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SourceDocumentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ProcessingAttemptId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    EventType = table.Column<string>(type: "nvarchar(48)", maxLength: 48, nullable: false),
                    ActorAdminId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    ActorType = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Reason = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    Outcome = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    SafeErrorCode = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    OccurredAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreationTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiOrderOperationalEvents", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AiOrderOperationalEvents_AiOrderImports_ImportId",
                        column: x => x.ImportId,
                        principalSchema: "teenova",
                        principalTable: "AiOrderImports",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AiOrderOperationalEvents_AiOrderProcessingAttempts_ProcessingAttemptId",
                        column: x => x.ProcessingAttemptId,
                        principalSchema: "teenova",
                        principalTable: "AiOrderProcessingAttempts",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_AiOrderOperationalEvents_AiOrderSourceDocuments_SourceDocumentId",
                        column: x => x.SourceDocumentId,
                        principalSchema: "teenova",
                        principalTable: "AiOrderSourceDocuments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderSourceDocuments_DeletionOutcome_DeletionNextRetryAt",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                columns: new[] { "DeletionOutcome", "DeletionNextRetryAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderProcessingAttempts_RawResultDeletionNextRetryAt_RawResultDeletedAt",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                columns: new[] { "RawResultDeletionNextRetryAt", "RawResultDeletedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderOperationalEvents_EventType_OccurredAt",
                schema: "teenova",
                table: "AiOrderOperationalEvents",
                columns: new[] { "EventType", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderOperationalEvents_ImportId_OccurredAt",
                schema: "teenova",
                table: "AiOrderOperationalEvents",
                columns: new[] { "ImportId", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderOperationalEvents_Outcome_OccurredAt",
                schema: "teenova",
                table: "AiOrderOperationalEvents",
                columns: new[] { "Outcome", "OccurredAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderOperationalEvents_ProcessingAttemptId",
                schema: "teenova",
                table: "AiOrderOperationalEvents",
                column: "ProcessingAttemptId");

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderOperationalEvents_SourceDocumentId",
                schema: "teenova",
                table: "AiOrderOperationalEvents",
                column: "SourceDocumentId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AiOrderOperationalEvents",
                schema: "teenova");

            migrationBuilder.DropIndex(
                name: "IX_AiOrderSourceDocuments_DeletionOutcome_DeletionNextRetryAt",
                schema: "teenova",
                table: "AiOrderSourceDocuments");

            migrationBuilder.DropIndex(
                name: "IX_AiOrderProcessingAttempts_RawResultDeletionNextRetryAt_RawResultDeletedAt",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "DeletionFailureCount",
                schema: "teenova",
                table: "AiOrderSourceDocuments");

            migrationBuilder.DropColumn(
                name: "DeletionNextRetryAt",
                schema: "teenova",
                table: "AiOrderSourceDocuments");

            migrationBuilder.DropColumn(
                name: "RawResultDeletionFailureCount",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "RawResultDeletionNextRetryAt",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "RawResultDeletionSafeErrorCode",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "RetentionHoldExpiresAt",
                schema: "teenova",
                table: "AiOrderImports");

            migrationBuilder.DropColumn(
                name: "RetentionHoldPlacedAt",
                schema: "teenova",
                table: "AiOrderImports");

            migrationBuilder.DropColumn(
                name: "RetentionHoldPlacedByAdminId",
                schema: "teenova",
                table: "AiOrderImports");

            migrationBuilder.DropColumn(
                name: "RetentionHoldReason",
                schema: "teenova",
                table: "AiOrderImports");
        }
    }
}
