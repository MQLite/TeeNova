using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddOnlinePaymentSurchargeSnapshot : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // BaseAmount uses an expand / backfill / tighten sequence on purpose. A non-null column with a
            // zero default would silently rewrite every historical session's commercial amount to 0.00;
            // instead each existing row inherits its own Amount, preserving the legacy identity
            // Amount = BaseAmount (surcharge 0).
            migrationBuilder.AddColumn<decimal>(
                name: "BaseAmount",
                schema: "teenova",
                table: "OnlinePaymentSessions",
                type: "decimal(18,4)",
                nullable: true);

            migrationBuilder.Sql(
                "UPDATE [teenova].[OnlinePaymentSessions] SET [BaseAmount] = [Amount] WHERE [BaseAmount] IS NULL;");

            migrationBuilder.AlterColumn<decimal>(
                name: "BaseAmount",
                schema: "teenova",
                table: "OnlinePaymentSessions",
                type: "decimal(18,4)",
                nullable: false,
                oldClrType: typeof(decimal),
                oldType: "decimal(18,4)",
                oldNullable: true);

            migrationBuilder.AddColumn<string>(
                name: "ProviderMode",
                schema: "teenova",
                table: "OnlinePaymentSessions",
                type: "nvarchar(32)",
                maxLength: 32,
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "SurchargeAmount",
                schema: "teenova",
                table: "OnlinePaymentSessions",
                type: "decimal(18,4)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "SurchargeCalculationVersion",
                schema: "teenova",
                table: "OnlinePaymentSessions",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "legacy-no-surcharge");

            migrationBuilder.AddColumn<decimal>(
                name: "SurchargeFixedAmount",
                schema: "teenova",
                table: "OnlinePaymentSessions",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "SurchargePercentageBasisPoints",
                schema: "teenova",
                table: "OnlinePaymentSessions",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "BaseAmount",
                schema: "teenova",
                table: "OnlinePaymentSessions");

            migrationBuilder.DropColumn(
                name: "ProviderMode",
                schema: "teenova",
                table: "OnlinePaymentSessions");

            migrationBuilder.DropColumn(
                name: "SurchargeAmount",
                schema: "teenova",
                table: "OnlinePaymentSessions");

            migrationBuilder.DropColumn(
                name: "SurchargeCalculationVersion",
                schema: "teenova",
                table: "OnlinePaymentSessions");

            migrationBuilder.DropColumn(
                name: "SurchargeFixedAmount",
                schema: "teenova",
                table: "OnlinePaymentSessions");

            migrationBuilder.DropColumn(
                name: "SurchargePercentageBasisPoints",
                schema: "teenova",
                table: "OnlinePaymentSessions");
        }
    }
}
