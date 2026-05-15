using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddEmailSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "EmailSettings",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    AdminNotificationEmail = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    ReplyToAddress = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    SenderName = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    ShopContactInfo = table.Column<string>(type: "nvarchar(1000)", maxLength: 1000, nullable: true),
                    ReadyPickupMessage = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    ReadyShippingMessage = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    CompletedMessage = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: true),
                    AdminOrderBaseUrl = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: true),
                    LastModificationTime = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LastModifierId = table.Column<Guid>(type: "uniqueidentifier", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EmailSettings", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EmailSettings",
                schema: "teenova");
        }
    }
}
