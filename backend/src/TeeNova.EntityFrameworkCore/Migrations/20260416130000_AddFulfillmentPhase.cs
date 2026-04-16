using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TeeNova.EntityFrameworkCore;

[DbContext(typeof(TeeNovaDbContext))]
[Migration("20260416130000_AddFulfillmentPhase")]
public partial class AddFulfillmentPhase : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<string>(
            name: "DeliveryMethod",
            schema: "teenova",
            table: "Orders",
            type: "nvarchar(32)",
            maxLength: 32,
            nullable: true);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "DeliveryMethod",
            schema: "teenova",
            table: "Orders");
    }
}
