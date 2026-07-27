using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class AddStripeSurchargeSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "SurchargeCalculationVersion",
                schema: "teenova",
                table: "PaymentProviderSettings",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: false,
                defaultValue: "stripe-gross-up-v1");

            migrationBuilder.AddColumn<string>(
                name: "SurchargeDisclosureText",
                schema: "teenova",
                table: "PaymentProviderSettings",
                type: "nvarchar(500)",
                maxLength: 500,
                nullable: false,
                defaultValue: "A card processing surcharge applies to online card payments. The fee is shown before you continue to Stripe.");

            migrationBuilder.AddColumn<bool>(
                name: "SurchargeEnabled",
                schema: "teenova",
                table: "PaymentProviderSettings",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "SurchargeFixedAmount",
                schema: "teenova",
                table: "PaymentProviderSettings",
                type: "decimal(18,2)",
                nullable: false,
                defaultValue: 0.30m);

            migrationBuilder.AddColumn<int>(
                name: "SurchargePercentageBasisPoints",
                schema: "teenova",
                table: "PaymentProviderSettings",
                type: "int",
                nullable: false,
                defaultValue: 265);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "SurchargeCalculationVersion",
                schema: "teenova",
                table: "PaymentProviderSettings");

            migrationBuilder.DropColumn(
                name: "SurchargeDisclosureText",
                schema: "teenova",
                table: "PaymentProviderSettings");

            migrationBuilder.DropColumn(
                name: "SurchargeEnabled",
                schema: "teenova",
                table: "PaymentProviderSettings");

            migrationBuilder.DropColumn(
                name: "SurchargeFixedAmount",
                schema: "teenova",
                table: "PaymentProviderSettings");

            migrationBuilder.DropColumn(
                name: "SurchargePercentageBasisPoints",
                schema: "teenova",
                table: "PaymentProviderSettings");
        }
    }
}
