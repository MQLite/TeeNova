using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TeeNova.Migrations
{
    /// <inheritdoc />
    public partial class CleanupObsoletePrintConfig : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Step 1: Remove PrintAreaSizeOptions linked to obsolete PrintAreas or PrintSizes.
            // These must be removed first to satisfy FK constraints before touching PrintAreas/PrintSizes.

            // Options linked to Neck Label PrintArea
            migrationBuilder.Sql(@"
                DELETE FROM [teenova].[PrintAreaSizeOptions]
                WHERE PrintAreaId IN (
                    SELECT Id FROM [teenova].[PrintAreas] WHERE Code = 'NECK_LABEL'
                );");

            // Options linked to obsolete PrintSizes
            migrationBuilder.Sql(@"
                DELETE FROM [teenova].[PrintAreaSizeOptions]
                WHERE PrintSizeId IN (
                    SELECT Id FROM [teenova].[PrintSizes]
                    WHERE Code IN ('SMALL_CHEST', 'LARGE_BACK', 'NECK_LABEL_SIZE')
                );");

            // Invalid Left Chest / Right Chest + paper-size (A3/A4/A5) combinations
            migrationBuilder.Sql(@"
                DELETE FROM [teenova].[PrintAreaSizeOptions]
                WHERE PrintAreaId IN (
                    SELECT Id FROM [teenova].[PrintAreas] WHERE Code IN ('LEFT_CHEST', 'RIGHT_CHEST')
                )
                AND PrintSizeId IN (
                    SELECT Id FROM [teenova].[PrintSizes] WHERE Code IN ('A3', 'A4', 'A5')
                );");

            // Step 2: Delete obsolete PrintSizes (no remaining FK dependents after step 1).
            migrationBuilder.Sql(@"
                DELETE FROM [teenova].[PrintSizes]
                WHERE Code IN ('SMALL_CHEST', 'LARGE_BACK', 'NECK_LABEL_SIZE');");

            // Step 3: Deactivate Neck Label PrintArea.
            // Soft-delete to preserve the LegacyPositionValue = 6 bridge mapping for the
            // legacy PrintPosition enum. Physical rows in Orders are not affected.
            migrationBuilder.Sql(@"
                UPDATE [teenova].[PrintAreas]
                SET IsActive = 0
                WHERE Code = 'NECK_LABEL';");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Reactivate Neck Label PrintArea
            migrationBuilder.Sql(@"
                UPDATE [teenova].[PrintAreas]
                SET IsActive = 1
                WHERE Code = 'NECK_LABEL';");

            // Re-insert obsolete PrintSizes (approximate rollback — SortOrder and BasePrice
            // match original seed values; IDs are regenerated so not identical to originals).
            migrationBuilder.Sql(@"
                INSERT INTO [teenova].[PrintSizes] (Id, Name, Code, BasePrice, IsActive, SortOrder)
                SELECT NEWID(), 'Small Chest',    'SMALL_CHEST',    0, 1, 3
                WHERE NOT EXISTS (SELECT 1 FROM [teenova].[PrintSizes] WHERE Code = 'SMALL_CHEST');

                INSERT INTO [teenova].[PrintSizes] (Id, Name, Code, BasePrice, IsActive, SortOrder)
                SELECT NEWID(), 'Large Back',     'LARGE_BACK',     0, 1, 4
                WHERE NOT EXISTS (SELECT 1 FROM [teenova].[PrintSizes] WHERE Code = 'LARGE_BACK');

                INSERT INTO [teenova].[PrintSizes] (Id, Name, Code, BasePrice, IsActive, SortOrder)
                SELECT NEWID(), 'Neck Label Size','NECK_LABEL_SIZE', 0, 1, 5
                WHERE NOT EXISTS (SELECT 1 FROM [teenova].[PrintSizes] WHERE Code = 'NECK_LABEL_SIZE');");

            // PrintAreaSizeOption rows deleted in Up() are not restored in Down() — their GUIDs
            // were generated at seed time and are not recoverable. Re-running seed will recreate
            // the canonical combinations; obsolete ones will not be re-seeded.
        }
    }
}
