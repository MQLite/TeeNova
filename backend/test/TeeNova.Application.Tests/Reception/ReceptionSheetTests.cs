using TeeNova.Reception;

namespace TeeNova.Tests.Reception;

public class ReceptionSheetTests
{
    [Fact]
    public void Manual_adjustment_can_correct_pickup_but_cannot_delete_or_reopen_deleted_sheets()
    {
        var sheet = new ReceptionSheet(Guid.NewGuid(), "QA", "", null, "");
        Assert.True(sheet.TryAdvance(ReceptionStage.Collected, manualAdjustment: true));
        Assert.True(sheet.TryAdvance(ReceptionStage.Ready, manualAdjustment: true));
        Assert.True(sheet.TryAdvance(ReceptionStage.Preparing, manualAdjustment: true));
        Assert.False(sheet.TryAdvance(ReceptionStage.Deleted, manualAdjustment: true));
        Assert.Equal(ReceptionStage.Preparing, sheet.Stage);
        sheet.MarkDeleted();
        Assert.False(sheet.TryAdvance(ReceptionStage.Ready, manualAdjustment: true));
    }

    [Fact]
    public void Source_photo_can_be_replaced_and_survives_work_order_edits()
    {
        var sheet = new ReceptionSheet(Guid.NewGuid(), "", "", null, "");
        Assert.Null(sheet.ReadSourcePhoto());
        sheet.SetSourcePhoto(new(Guid.NewGuid(), Guid.NewGuid()));
        var replacement = new ReceptionPhotoSource(Guid.NewGuid(), Guid.NewGuid());
        sheet.SetSourcePhoto(replacement);
        sheet.Revise("C", "021", null, "M 8", null, 120m, 20m, null);
        Assert.Equal(replacement, sheet.ReadSourcePhoto());
        sheet.SetSourcePhoto(null);
        Assert.Null(sheet.ReadSourcePhoto());
    }

    [Fact]
    public void Revising_a_collected_sheet_updates_original_ink_and_amounts_without_resetting_stage()
    {
        var sheet = new ReceptionSheet(Guid.NewGuid(), "C", "021", null, "First version", "{}");
        sheet.TryAdvance(ReceptionStage.Ready);
        sheet.TryAdvance(ReceptionStage.Collected);
        sheet.Revise("Catherina", "0210", new DateOnly(2026, 11, 27), "Updated", null, 126.95m, 0m, "[]");
        Assert.Equal(126.95m, sheet.TotalPrice);
        Assert.Equal(0m, sheet.Deposit);
        Assert.Equal("[]", sheet.HandwritingJson);
        Assert.Null(sheet.ReadPrintLayout());
        Assert.Equal(ReceptionStage.Collected, sheet.Stage);
        sheet.Revise("Catherina", "0210", sheet.PickupDate, "Updated", null, null, null, null);
        Assert.Null(sheet.Deposit);
        Assert.Null(sheet.TotalPrice);
        Assert.Null(sheet.HandwritingJson);
    }

    [Fact]
    public void Pickup_is_sequential_and_repeatable_without_changing_printed_details()
    {
        var sheet = new ReceptionSheet(Guid.NewGuid(), " Catherina ", "0210000000",
            new DateOnly(2026, 11, 27), "White B&F\nM × 8 / L × 10");
        Assert.Equal(ReceptionStage.Preparing, sheet.Stage);
        Assert.False(sheet.TryAdvance(ReceptionStage.Collected));
        Assert.True(sheet.TryAdvance(ReceptionStage.Ready));
        Assert.True(sheet.TryAdvance(ReceptionStage.Ready));
        Assert.True(sheet.TryAdvance(ReceptionStage.Collected));
        Assert.False(sheet.TryAdvance(ReceptionStage.Ready));
        Assert.Equal("0210000000", sheet.Phone);
        Assert.Equal("Catherina", sheet.Customer);
        Assert.Equal("White B&F\nM × 8 / L × 10", sheet.Instructions);
    }
}
