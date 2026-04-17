using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using TeeNova.EntityFrameworkCore;

#nullable disable

namespace TeeNova.Migrations
{
    [DbContext(typeof(TeeNovaDbContext))]
    [Migration("20260416143000_MigrateLegacyOrderStatusesToNewWorkflow")]
    public partial class MigrateLegacyOrderStatusesToNewWorkflow : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
UPDATE [teenova].[Orders]
SET [Status] = CASE [Status]
    WHEN 'Confirmed' THEN 'Reviewing'
    WHEN 'InProduction' THEN 'Printing'
    WHEN 'Shipped' THEN 'Completed'
    WHEN 'Delivered' THEN 'Completed'
    ELSE [Status]
END
WHERE [Status] IN ('Confirmed', 'InProduction', 'Shipped', 'Delivered');
");

            migrationBuilder.Sql(@"
UPDATE [teenova].[OrderTimelineEntries]
SET [Status] = CASE [Status]
    WHEN 'Confirmed' THEN 'Reviewing'
    WHEN 'InProduction' THEN 'Printing'
    WHEN 'Shipped' THEN 'Completed'
    WHEN 'Delivered' THEN 'Completed'
    ELSE [Status]
END
WHERE [Status] IN ('Confirmed', 'InProduction', 'Shipped', 'Delivered');
");

            migrationBuilder.Sql(@"
UPDATE [teenova].[OrderTimelineEntries]
SET [Description] = CASE [Description]
    WHEN 'Status changed to Confirmed' THEN 'Status changed to Reviewing'
    WHEN 'Status changed to InProduction' THEN 'Status changed to Printing'
    WHEN 'Status changed to Shipped' THEN 'Status changed to Completed'
    WHEN 'Status changed to Delivered' THEN 'Status changed to Completed'
    ELSE [Description]
END
WHERE [Description] IN (
    'Status changed to Confirmed',
    'Status changed to InProduction',
    'Status changed to Shipped',
    'Status changed to Delivered'
);
");
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            throw new NotSupportedException(
                "This migration cannot be safely rolled back because it normalizes legacy order statuses in place.");
        }
    }
}
