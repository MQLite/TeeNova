using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    public partial class AddOrderItemPositionAssets : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OrderItemPositionAssets",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    OrderItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Position = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    UploadedAssetId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                    UploadedAssetUrl = table.Column<string>(type: "nvarchar(1024)", maxLength: 1024, nullable: true),
                    DesignNote = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrderItemPositionAssets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OrderItemPositionAssets_OrderItems_OrderItemId",
                        column: x => x.OrderItemId,
                        principalSchema: "teenova",
                        principalTable: "OrderItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_OrderItemPositionAssets_OrderItemId_Position",
                schema: "teenova",
                table: "OrderItemPositionAssets",
                columns: new[] { "OrderItemId", "Position" },
                unique: true);

            migrationBuilder.Sql(
                """
                INSERT INTO [teenova].[OrderItemPositionAssets] ([Id], [OrderItemId], [Position], [UploadedAssetId], [UploadedAssetUrl], [DesignNote])
                SELECT
                    NEWID(),
                    oi.[Id],
                    JSON_VALUE([value], '$.position'),
                    TRY_CONVERT(uniqueidentifier, JSON_VALUE([value], '$.assetId')),
                    JSON_VALUE([value], '$.assetUrl'),
                    JSON_VALUE([value], '$.designNote')
                FROM [teenova].[OrderItems] oi
                CROSS APPLY OPENJSON(oi.[PrintPositionsJson])
                WHERE oi.[PrintPositionsJson] IS NOT NULL
                  AND JSON_VALUE([value], '$.position') IS NOT NULL;
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OrderItemPositionAssets",
                schema: "teenova");
        }
    }
}
