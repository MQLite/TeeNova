using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Inventory;

namespace TeeNova.EntityFrameworkCore.Inventory;

public class InventorySettingsEntityTypeConfiguration : IEntityTypeConfiguration<InventorySettings>
{
    public void Configure(EntityTypeBuilder<InventorySettings> builder)
    {
        builder.ToTable("InventorySettings");

        builder.Property(e => e.AutoDeductOnPressedEnabled)
            .HasDefaultValue(false);
    }
}
