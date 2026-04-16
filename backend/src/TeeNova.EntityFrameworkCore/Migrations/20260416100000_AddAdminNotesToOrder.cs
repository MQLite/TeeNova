using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TeeNova.EntityFrameworkCore;

#nullable disable

namespace TeeNova.Migrations
{
    [DbContext(typeof(TeeNovaDbContext))]
    [Migration("20260416100000_AddAdminNotesToOrder")]
    public partial class AddAdminNotesToOrder : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AdminNotes",
                schema: "teenova",
                table: "Orders",
                type: "nvarchar(4000)",
                maxLength: 4000,
                nullable: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AdminNotes",
                schema: "teenova",
                table: "Orders");
        }
    }
}
