using Microsoft.AspNetCore.DataProtection;

namespace TeeNova.AdminLogs;

public sealed class AdminLogFileIdProtectorTests
{
    [Fact]
    public void Valid_unicode_payload_round_trips_without_exposing_a_path()
    {
        var clock = new MutableTimeProvider(new DateTimeOffset(2026, 7, 20, 2, 15, 0, TimeSpan.Zero));
        var protector = CreateProtector(clock);
        var payload = Payload("api", "应用-日志.log", "FINGERPRINT-A");

        var id = protector.Protect(payload, TimeSpan.FromMinutes(10));

        Assert.DoesNotContain(Path.GetTempPath(), id, StringComparison.OrdinalIgnoreCase);
        Assert.True(protector.TryUnprotect(id, "api", "FINGERPRINT-A", out var result, out var failure));
        Assert.Equal(AdminLogFileIdFailure.None, failure);
        Assert.Equal("应用-日志.log", result!.FileName);
    }

    [Fact]
    public void Tampered_token_is_rejected()
    {
        var protector = CreateProtector();
        var id = protector.Protect(Payload("api", "logs.txt", "ROOT"), TimeSpan.FromMinutes(10));
        var index = id.Length / 2;
        var tampered = id[..index] + (id[index] == 'A' ? 'B' : 'A') + id[(index + 1)..];

        Assert.False(protector.TryUnprotect(tampered, "api", "ROOT", out _, out var failure));
        Assert.Equal(AdminLogFileIdFailure.Invalid, failure);
    }

    [Fact]
    public void Expired_token_is_rejected()
    {
        var clock = new MutableTimeProvider(new DateTimeOffset(2026, 7, 20, 0, 0, 0, TimeSpan.Zero));
        var protector = CreateProtector(clock);
        var id = protector.Protect(Payload("api", "logs.txt", "ROOT"), TimeSpan.FromMinutes(1));
        clock.UtcNow = clock.UtcNow.AddMinutes(2);

        Assert.False(protector.TryUnprotect(id, "api", "ROOT", out _, out var failure));
        Assert.Equal(AdminLogFileIdFailure.Expired, failure);
    }

    [Fact]
    public void Future_issued_time_and_invalid_temporal_order_are_rejected()
    {
        var clock = new MutableTimeProvider(new DateTimeOffset(2026, 7, 20, 2, 0, 0, TimeSpan.Zero));
        var protector = CreateProtector(clock);
        var futureIssued = protector.Protect(Payload("api", "logs.txt", "ROOT"), TimeSpan.FromMinutes(10));
        clock.UtcNow = clock.UtcNow.AddMinutes(-1);
        Assert.False(protector.TryUnprotect(futureIssued, out _, out var futureFailure));
        Assert.Equal(AdminLogFileIdFailure.Invalid, futureFailure);

        clock.UtcNow = clock.UtcNow.AddMinutes(1);
        var invalidOrder = protector.Protect(Payload("api", "logs.txt", "ROOT"), TimeSpan.FromMinutes(-1));
        Assert.False(protector.TryUnprotect(invalidOrder, out _, out var orderFailure));
        Assert.Equal(AdminLogFileIdFailure.Invalid, orderFailure);
    }

    [Theory]
    [InlineData("other", "ROOT")]
    [InlineData("api", "CHANGED")]
    public void Source_or_root_fingerprint_change_invalidates_token(string source, string fingerprint)
    {
        var protector = CreateProtector();
        var id = protector.Protect(Payload("api", "logs.txt", "ROOT"), TimeSpan.FromMinutes(10));

        Assert.False(protector.TryUnprotect(id, source, fingerprint, out _, out var failure));
        Assert.Equal(AdminLogFileIdFailure.SourceChanged, failure);
    }

    [Theory]
    [InlineData("../logs.txt")]
    [InlineData("folder/logs.txt")]
    [InlineData("folder\\logs.txt")]
    [InlineData("logs.txt\r\nInjected: value")]
    [InlineData("logs.txt\0.json")]
    [InlineData("C:logs.txt")]
    [InlineData("logs.txt:alternate.log")]
    public void Unsafe_basename_is_rejected(string fileName)
    {
        Assert.False(AdminLogFileIdProtector.IsSafeBasename(fileName));
    }

    private static AdminLogFileIdProtector CreateProtector(TimeProvider? clock = null)
        => new(new EphemeralDataProtectionProvider(), clock ?? TimeProvider.System);

    private static AdminLogFileIdPayload Payload(string source, string fileName, string fingerprint) => new()
    {
        SourceKey = source,
        FileName = fileName,
        RootFingerprint = fingerprint,
        SizeBytes = 42,
        LastModifiedUtc = new DateTime(2026, 7, 20, 2, 15, 0, DateTimeKind.Utc),
        DeviceId = 1,
        Inode = 2,
    };

    private sealed class MutableTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public DateTimeOffset UtcNow { get; set; } = utcNow;
        public override DateTimeOffset GetUtcNow() => UtcNow;
    }
}
