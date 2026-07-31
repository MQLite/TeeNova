using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddAiOrderImportIntakeMetadata : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_AiOrderSourceDocuments_ImportId_Sequence",
                schema: "teenova",
                table: "AiOrderSourceDocuments");

            migrationBuilder.AddColumn<int>(
                name: "ImageHeight",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "ImageWidth",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "QualityWarningsJson",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "RotationDegrees",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "UploadIdempotencyKey",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AiOrderSourceAccessAudits",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ImportId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SourceDocumentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AdminActorId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AccessType = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Succeeded = table.Column<bool>(type: "bit", nullable: false),
                    FailureCategory = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    AccessedAt = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreationTime = table.Column<DateTime>(type: "datetime2", nullable: false),
                    CreatorId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AiOrderSourceAccessAudits", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderSourceDocuments_ImportId_Sequence",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                columns: new[] { "ImportId", "Sequence" },
                unique: true,
                filter: "[ContentDeletedAt] IS NULL");

            migrationBuilder.CreateIndex(
                name: "UX_AiOrderSourceDocuments_Import_UploadKey",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                columns: new[] { "ImportId", "UploadIdempotencyKey" },
                unique: true,
                filter: "[UploadIdempotencyKey] IS NOT NULL");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiOrderSourceDocuments_ImageDimensions",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                sql: "([ImageWidth] IS NULL AND [ImageHeight] IS NULL) OR ([ImageWidth] > 0 AND [ImageHeight] > 0)");

            migrationBuilder.AddCheckConstraint(
                name: "CK_AiOrderSourceDocuments_Rotation",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                sql: "[RotationDegrees] IN (0, 90, 180, 270)");

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderSourceAccessAudits_AdminActorId_AccessedAt",
                schema: "teenova",
                table: "AiOrderSourceAccessAudits",
                columns: new[] { "AdminActorId", "AccessedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderSourceAccessAudits_ImportId_AccessedAt",
                schema: "teenova",
                table: "AiOrderSourceAccessAudits",
                columns: new[] { "ImportId", "AccessedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderSourceAccessAudits_SourceDocumentId_AccessedAt",
                schema: "teenova",
                table: "AiOrderSourceAccessAudits",
                columns: new[] { "SourceDocumentId", "AccessedAt" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AiOrderSourceAccessAudits",
                schema: "teenova");

            migrationBuilder.DropIndex(
                name: "IX_AiOrderSourceDocuments_ImportId_Sequence",
                schema: "teenova",
                table: "AiOrderSourceDocuments");

            migrationBuilder.DropIndex(
                name: "UX_AiOrderSourceDocuments_Import_UploadKey",
                schema: "teenova",
                table: "AiOrderSourceDocuments");

            migrationBuilder.DropCheckConstraint(
                name: "CK_AiOrderSourceDocuments_ImageDimensions",
                schema: "teenova",
                table: "AiOrderSourceDocuments");

            migrationBuilder.DropCheckConstraint(
                name: "CK_AiOrderSourceDocuments_Rotation",
                schema: "teenova",
                table: "AiOrderSourceDocuments");

            migrationBuilder.DropColumn(
                name: "ImageHeight",
                schema: "teenova",
                table: "AiOrderSourceDocuments");

            migrationBuilder.DropColumn(
                name: "ImageWidth",
                schema: "teenova",
                table: "AiOrderSourceDocuments");

            migrationBuilder.DropColumn(
                name: "QualityWarningsJson",
                schema: "teenova",
                table: "AiOrderSourceDocuments");

            migrationBuilder.DropColumn(
                name: "RotationDegrees",
                schema: "teenova",
                table: "AiOrderSourceDocuments");

            migrationBuilder.DropColumn(
                name: "UploadIdempotencyKey",
                schema: "teenova",
                table: "AiOrderSourceDocuments");

            migrationBuilder.CreateIndex(
                name: "IX_AiOrderSourceDocuments_ImportId_Sequence",
                schema: "teenova",
                table: "AiOrderSourceDocuments",
                columns: new[] { "ImportId", "Sequence" },
                unique: true);
        }
    }
}
