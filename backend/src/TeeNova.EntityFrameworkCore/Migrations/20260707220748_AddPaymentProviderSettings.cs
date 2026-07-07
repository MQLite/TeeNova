using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddPaymentProviderSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PaymentProviderSettings",
                schema: "teenova",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Provider = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false),
                    Mode = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    IsEnabled = table.Column<bool>(type: "bit", nullable: false),
                    Currency = table.Column<string>(type: "nvarchar(10)", maxLength: 10, nullable: false),
                    PublishableKey = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    SecretKeyCipherText = table.Column<string>(type: "nvarchar(2048)", maxLength: 2048, nullable: true),
                    WebhookSecretCipherText = table.Column<string>(type: "nvarchar(2048)", maxLength: 2048, nullable: true),
                    SecretKeyLast4 = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: true),
                    WebhookSecretLast4 = table.Column<string>(type: "nvarchar(8)", maxLength: 8, nullable: true),
                    SuccessReturnBaseUrl = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: true),
                    CancelReturnBaseUrl = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: true),
                    LastValidatedAt = table.Column<DateTime>(type: "datetime2", nullable: true),
                    LastValidationStatus = table.Column<string>(type: "nvarchar(16)", maxLength: 16, nullable: false),
                    LastValidationMessageCode = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
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
                    table.PrimaryKey("PK_PaymentProviderSettings", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PaymentProviderSettings_Provider_Mode",
                schema: "teenova",
                table: "PaymentProviderSettings",
                columns: new[] { "Provider", "Mode" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PaymentProviderSettings",
                schema: "teenova");
        }
    }
}
