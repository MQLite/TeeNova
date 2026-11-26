using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddReceptionSheetPdfArchive : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "PrintEstimate",
                schema: "teenova",
                table: "ReceptionSheets",
                type: "nvarchar(max)",
                maxLength: 10000,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ReceptionSheetPdfs",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    SheetId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Version = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Template = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    SnapshotJson = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    Attempt = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    LeaseUntilUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    Pages = table.Column<int>(type: "int", nullable: true),
                    Content = table.Column<byte[]>(type: "varbinary(max)", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReceptionSheetPdfs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReceptionSheetPdfs_ReceptionSheets_SheetId",
                        column: x => x.SheetId,
                        principalSchema: "teenova",
                        principalTable: "ReceptionSheets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ReceptionSheetPdfs_SheetId_Version_Template",
                schema: "teenova",
                table: "ReceptionSheetPdfs",
                columns: new[] { "SheetId", "Version", "Template" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ReceptionSheetPdfs",
                schema: "teenova");

            migrationBuilder.DropColumn(
                name: "PrintEstimate",
                schema: "teenova",
                table: "ReceptionSheets");
        }
    }
}
