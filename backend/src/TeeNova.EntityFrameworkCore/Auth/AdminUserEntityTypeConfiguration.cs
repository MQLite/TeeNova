using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using TeeNova.Auth;

namespace TeeNova.EntityFrameworkCore.Auth;

public class AdminUserEntityTypeConfiguration : IEntityTypeConfiguration<AdminUser>
{
    public void Configure(EntityTypeBuilder<AdminUser> builder)
    {
        builder.ToTable("AdminUsers");

        builder.Property(u => u.Username)
            .IsRequired()
            .HasMaxLength(50);

        builder.HasIndex(u => u.Username)
            .IsUnique();

        builder.Property(u => u.PasswordHash)
            .IsRequired()
            .HasMaxLength(100);

        builder.Property(u => u.DisplayName)
            .HasMaxLength(100);

        builder.Property(u => u.Role)
            .IsRequired();
    }
}
