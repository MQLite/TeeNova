using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddAiOrderRecognitionEvidence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_AiOrderProcessingAttempts_TokenCounts",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.AddColumn<decimal>(
                name: "ActualCostUsd",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "decimal(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ApiMode",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ApiVersion",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "CachedInputTokenCount",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ContractVersion",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "DurationMilliseconds",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "bigint",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "EstimatedCostUsd",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "decimal(18,6)",
                precision: 18,
                scale: 6,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "FinishReason",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PricingSnapshotJson",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PricingVersion",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PromptVersion",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RawResultDeletedAt",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "RawResultRetentionUntil",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "RepairAttempted",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<string>(
                name: "SourceSnapshotJson",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StartOperationKey",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StartRequestHash",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "nchar(64)",
                fixedLength: true,
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StructuredOutputMode",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "WorkerClaimExpiresAt",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WorkerClaimToken",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Model",
                schema: "teenova",
                table: "AiOrderImportRevisions",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PricingVersion",
                schema: "teenova",
                table: "AiOrderImportRevisions",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "ProcessingAttemptId",
                schema: "teenova",
                table: "AiOrderImportRevisions",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PromptVersion",
                schema: "teenova",
                table: "AiOrderImportRevisions",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Provider",
                schema: "teenova",
                table: "AiOrderImportRevisions",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StructuredOutputMode",
                schema: "teenova",
                table: "AiOrderImportRevisions",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderProcessingAttempts_Outcome_WorkerClaimExpiresAt",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                columns: new[] { "Outcome", "WorkerClaimExpiresAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderProcessingAttempts_RawResultRetentionUntil_RawResultDeletedAt",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                columns: new[] { "RawResultRetentionUntil", "RawResultDeletedAt" });

            migrationBuilder.CreateIndex(
                name: "UX_AiOrderProcessingAttempts_Import_StartKey",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                columns: new[] { "ImportId", "StartOperationKey" },
                unique: true,
                filter: "[StartOperationKey] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiOrderProcessingAttempts_Costs",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                sql: "([EstimatedCostUsd] IS NULL OR [EstimatedCostUsd] >= 0) AND ([ActualCostUsd] IS NULL OR [ActualCostUsd] >= 0)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiOrderProcessingAttempts_TokenCounts",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                sql: "([InputTokenCount] IS NULL OR [InputTokenCount] >= 0) AND ([OutputTokenCount] IS NULL OR [OutputTokenCount] >= 0) AND ([CachedInputTokenCount] IS NULL OR [CachedInputTokenCount] >= 0)");

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderImportRevisions_ProcessingAttemptId",
                schema: "teenova",
                table: "AiOrderImportRevisions",
                column: "ProcessingAttemptId",
                unique: true,
                filter: "[ProcessingAttemptId] IS NOT NULL");

            migrationBuilder.AddForeignKey(
                name: "FK_AiOrderImportRevisions_AiOrderProcessingAttempts_ProcessingAttemptId",
                schema: "teenova",
                table: "AiOrderImportRevisions",
                column: "ProcessingAttemptId",
                principalSchema: "teenova",
                principalTable: "AiOrderProcessingAttempts",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_AiOrderImportRevisions_AiOrderProcessingAttempts_ProcessingAttemptId",
                schema: "teenova",
                table: "AiOrderImportRevisions");

            migrationBuilder.DropIndex(
                name: "IX_AiOrderProcessingAttempts_Outcome_WorkerClaimExpiresAt",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropIndex(
                name: "IX_AiOrderProcessingAttempts_RawResultRetentionUntil_RawResultDeletedAt",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropIndex(
                name: "UX_AiOrderProcessingAttempts_Import_StartKey",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropCheckConstraint(
                name: "CK_AiOrderProcessingAttempts_Costs",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropCheckConstraint(
                name: "CK_AiOrderProcessingAttempts_TokenCounts",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropIndex(
                name: "IX_AiOrderImportRevisions_ProcessingAttemptId",
                schema: "teenova",
                table: "AiOrderImportRevisions");

            migrationBuilder.DropColumn(
                name: "ActualCostUsd",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "ApiMode",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "ApiVersion",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "CachedInputTokenCount",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "ContractVersion",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "DurationMilliseconds",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "EstimatedCostUsd",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "FinishReason",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "PricingSnapshotJson",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "PricingVersion",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "PromptVersion",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "RawResultDeletedAt",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "RawResultRetentionUntil",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "RepairAttempted",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "SourceSnapshotJson",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "StartOperationKey",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "StartRequestHash",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "StructuredOutputMode",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "WorkerClaimExpiresAt",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "WorkerClaimToken",
                schema: "teenova",
                table: "AiOrderProcessingAttempts");

            migrationBuilder.DropColumn(
                name: "Model",
                schema: "teenova",
                table: "AiOrderImportRevisions");

            migrationBuilder.DropColumn(
                name: "PricingVersion",
                schema: "teenova",
                table: "AiOrderImportRevisions");

            migrationBuilder.DropColumn(
                name: "ProcessingAttemptId",
                schema: "teenova",
                table: "AiOrderImportRevisions");

            migrationBuilder.DropColumn(
                name: "PromptVersion",
                schema: "teenova",
                table: "AiOrderImportRevisions");

            migrationBuilder.DropColumn(
                name: "Provider",
                schema: "teenova",
                table: "AiOrderImportRevisions");

            migrationBuilder.DropColumn(
                name: "StructuredOutputMode",
                schema: "teenova",
                table: "AiOrderImportRevisions");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiOrderProcessingAttempts_TokenCounts",
                schema: "teenova",
                table: "AiOrderProcessingAttempts",
                sql: "([InputTokenCount] IS NULL OR [InputTokenCount] >= 0) AND ([OutputTokenCount] IS NULL OR [OutputTokenCount] >= 0)");
        }
    }
}
