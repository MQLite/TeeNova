using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class Jira9512_BannerQuoteRequest : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BannerQuoteRequests",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProductNameSnapshot = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Quantity = table.Column<int>(type: "int", nullable: false),
                    CustomerName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    CustomerEmail = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    CustomerPhone = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    Message = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    UploadedAssetId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UploadedAssetUrl = table.Column<string>(type: "nvarchar(2048)", maxLength: 2048, nullable: true),
                    DesignNote = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    SizeMode = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    SizePresetId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    SizeLabel = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    Width = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    Height = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    Unit = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: true),
                    AreaSquareMetres = table.Column<decimal>(type: "decimal(18,4)", nullable: true),
                    Material = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    MaterialDisplayName = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    FinishingEyelets = table.Column<bool>(type: "bit", nullable: false),
                    FinishingHemming = table.Column<bool>(type: "bit", nullable: false),
                    FinishingPolePocket = table.Column<bool>(type: "bit", nullable: false),
                    FinishingOther = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: true),
                    StandIncluded = table.Column<bool>(type: "bit", nullable: false),
                    StandReplacementOnly = table.Column<bool>(type: "bit", nullable: false),
                    BannerNotes = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true),
                    Status = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    ConvertedOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
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
                    table.PrimaryKey("PK_BannerQuoteRequests", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_BannerQuoteRequests_ProductId",
                schema: "teenova",
                table: "BannerQuoteRequests",
                column: "ProductId");

            migrationBuilder.CreateIndex(
                name: "IX_BannerQuoteRequests_Status",
                schema: "teenova",
                table: "BannerQuoteRequests",
                column: "Status");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BannerQuoteRequests",
                schema: "teenova");
        }
    }
}
