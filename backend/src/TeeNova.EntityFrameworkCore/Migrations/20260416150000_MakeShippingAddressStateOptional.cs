using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TeeNova.EntityFrameworkCore;

#nullable disable

namespace TeeNova.Migrations
{
    [DbContext(typeof(TeeNovaDbContext))]
    [Migration("20260416150000_MakeShippingAddressStateOptional")]
    public partial class MakeShippingAddressStateOptional : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AlterColumn<string>(
                name: "ShippingAddress_State",
                schema: "teenova",
                table: "Orders",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: true,
                oldClrType: typeof(string),
                oldType: "nvarchar(128)",
                oldMaxLength: 128);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Restore empty strings for any rows that have NULL State before reverting to NOT NULL
            migrationBuilder.Sql(@"
UPDATE [teenova].[Orders]
SET [ShippingAddress_State] = ''
WHERE [ShippingAddress_State] IS NULL;
");

            migrationBuilder.AlterColumn<string>(
                name: "ShippingAddress_State",
                schema: "teenova",
                table: "Orders",
                type: "nvarchar(128)",
                maxLength: 128,
                nullable: false,
                defaultValue: "",
                oldClrType: typeof(string),
                oldType: "nvarchar(128)",
                oldMaxLength: 128,
                oldNullable: true);
        }
    }
}
