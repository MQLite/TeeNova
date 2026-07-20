using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using Volo.Abp;

namespace TeeNova.AdminLogs;

public sealed class AdminLogDownloadServiceTests
{
    [Fact]
    public async Task Valid_listed_id_resolves_current_source_and_opened_snapshot()
    {
        using var directory = new TemporaryDirectory();
        var path = directory.CreateFile("valid.log", "hello");
        var fixture = CreateFixture(directory.Source("api"));
        var id = fixture.Protect(path);

        await using var opened = await fixture.Service.PrepareAsync(id);

        Assert.Equal("api", opened.SourceKey);
        Assert.Equal("valid.log", opened.SafeFileName);
        Assert.Equal(5, opened.SnapshotLength);
        Assert.Equal("admin-id", opened.AuditContext.AdminUserId);
        Assert.Equal("administrator", opened.AuditContext.AdminUsername);
        Assert.Empty(fixture.Audit.Records);
    }

    [Theory]
    [InlineData("")]
    [InlineData("not-a-protected-id")]
    public async Task Empty_or_malformed_id_returns_safe_unavailable_and_one_failure_audit(string id)
    {
        using var directory = new TemporaryDirectory();
        var fixture = CreateFixture(directory.Source("api"));

        var exception = await Assert.ThrowsAsync<BusinessException>(() => fixture.Service.PrepareAsync(id));

        Assert.Equal(AdminLogsErrorCodes.FileUnavailable, exception.Code);
        Assert.Equal("Failed", Assert.Single(fixture.Audit.Records).Outcome);
        Assert.DoesNotContain(directory.Path, exception.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Tampered_id_is_unavailable_and_complete_token_is_never_audited()
    {
        using var directory = new TemporaryDirectory();
        var path = directory.CreateFile("valid.log", "hello");
        var fixture = CreateFixture(directory.Source("api"));
        var id = fixture.Protect(path);
        var index = id.Length / 2;
        var tampered = id[..index] + (id[index] == 'A' ? 'B' : 'A') + id[(index + 1)..];

        var exception = await Assert.ThrowsAsync<BusinessException>(() => fixture.Service.PrepareAsync(tampered));

        Assert.Equal(AdminLogsErrorCodes.FileUnavailable, exception.Code);
        var serializedAudit = JsonSerializer.Serialize(Assert.Single(fixture.Audit.Records));
        Assert.DoesNotContain(tampered, serializedAudit, StringComparison.Ordinal);
        Assert.DoesNotContain(directory.Path, serializedAudit, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Expired_id_returns_gone_specific_error()
    {
        using var directory = new TemporaryDirectory();
        var path = directory.CreateFile("expired.log", "hello");
        var clock = new MutableTimeProvider(new DateTimeOffset(2026, 7, 20, 1, 0, 0, TimeSpan.Zero));
        var fixture = CreateFixture(directory.Source("api"), clock);
        var id = fixture.Protect(path, TimeSpan.FromMinutes(1));
        clock.UtcNow = clock.UtcNow.AddMinutes(2);

        var exception = await Assert.ThrowsAsync<BusinessException>(() => fixture.Service.PrepareAsync(id));

        Assert.Equal(AdminLogsErrorCodes.FileIdExpired, exception.Code);
        Assert.Equal(410, Assert.Single(fixture.Audit.Records).HttpStatus);
    }

    [Fact]
    public async Task Unknown_source_and_root_fingerprint_change_are_unavailable()
    {
        using var configured = new TemporaryDirectory();
        using var original = new TemporaryDirectory();
        var fixture = CreateFixture(configured.Source("api"));

        var unknown = fixture.ProtectClaim(new AdminLogFileIdPayload
        {
            SourceKey = "removed",
            FileName = "file.log",
            RootFingerprint = "A",
            SizeBytes = 1,
        });
        var unknownException = await Assert.ThrowsAsync<BusinessException>(() => fixture.Service.PrepareAsync(unknown));
        Assert.Equal(AdminLogsErrorCodes.FileUnavailable, unknownException.Code);

        var originalSource = original.Source("api");
        var changed = fixture.ProtectClaim(new AdminLogFileIdPayload
        {
            SourceKey = "api",
            FileName = "file.log",
            RootFingerprint = AdminLogAppService.CreateRootFingerprint(originalSource),
            SizeBytes = 1,
        });
        var changedException = await Assert.ThrowsAsync<BusinessException>(() => fixture.Service.PrepareAsync(changed));
        Assert.Equal(AdminLogsErrorCodes.FileUnavailable, changedException.Code);
        Assert.Equal(2, fixture.Audit.Records.Count);
    }

    [Fact]
    public async Task Unsafe_basename_and_newly_unsupported_extension_are_rejected_before_open()
    {
        using var directory = new TemporaryDirectory();
        var fixture = CreateFixture(directory.Source("api"));
        var unsafeId = fixture.ProtectClaim(new AdminLogFileIdPayload
        {
            SourceKey = "api",
            FileName = "../secret.log",
            RootFingerprint = AdminLogAppService.CreateRootFingerprint(directory.Source("api")),
            SizeBytes = 1,
        });
        var unsafeException = await Assert.ThrowsAsync<BusinessException>(() => fixture.Service.PrepareAsync(unsafeId));
        Assert.Equal(AdminLogsErrorCodes.FileUnavailable, unsafeException.Code);

        var txtPath = directory.CreateFile("old.txt", "text");
        var txtId = fixture.Protect(txtPath);
        fixture.Options.AllowedExtensions = [".log"];
        var extensionException = await Assert.ThrowsAsync<BusinessException>(() => fixture.Service.PrepareAsync(txtId));
        Assert.Equal(AdminLogsErrorCodes.FileUnavailable, extensionException.Code);
    }

    [Fact]
    public async Task Replacement_truncation_oversize_delete_and_source_failure_map_safely()
    {
        using var directory = new TemporaryDirectory();
        var fixture = CreateFixture(directory.Source("api"));

        var replacePath = directory.CreateFile("replace.log", "old");
        var replaceId = fixture.Protect(replacePath);
        File.Move(replacePath, Path.Combine(directory.Path, "old.log"));
        directory.CreateFile("replace.log", "new");
        Assert.Equal(AdminLogsErrorCodes.FileChanged,
            (await Assert.ThrowsAsync<BusinessException>(() => fixture.Service.PrepareAsync(replaceId))).Code);

        var truncatePath = directory.CreateFile("truncate.log", "12345");
        var truncateId = fixture.Protect(truncatePath);
        File.WriteAllText(truncatePath, "1");
        Assert.Equal(AdminLogsErrorCodes.FileChanged,
            (await Assert.ThrowsAsync<BusinessException>(() => fixture.Service.PrepareAsync(truncateId))).Code);

        var largePath = directory.CreateFile("large.log", "123456");
        var largeId = fixture.Protect(largePath);
        fixture.Options.MaximumDownloadBytes = 5;
        Assert.Equal(AdminLogsErrorCodes.FileTooLarge,
            (await Assert.ThrowsAsync<BusinessException>(() => fixture.Service.PrepareAsync(largeId))).Code);

        var deletedPath = directory.CreateFile("deleted.log", "x");
        var deletedId = fixture.Protect(deletedPath);
        File.Delete(deletedPath);
        Assert.Equal(AdminLogsErrorCodes.FileUnavailable,
            (await Assert.ThrowsAsync<BusinessException>(() => fixture.Service.PrepareAsync(deletedId))).Code);

        directory.Dispose();
        Assert.Equal(AdminLogsErrorCodes.SourceUnavailable,
            (await Assert.ThrowsAsync<BusinessException>(() => fixture.Service.PrepareAsync(deletedId))).Code);
        Assert.Equal(5, fixture.Audit.Records.Count);
    }

    [Fact]
    public async Task Disabled_feature_fails_before_token_processing_and_audits_once()
    {
        using var directory = new TemporaryDirectory();
        var fixture = CreateFixture(directory.Source("api"));
        fixture.Options.Enabled = false;

        var exception = await Assert.ThrowsAsync<BusinessException>(() => fixture.Service.PrepareAsync("anything"));

        Assert.Equal(AdminLogsErrorCodes.Disabled, exception.Code);
        Assert.Equal("FeatureDisabled", Assert.Single(fixture.Audit.Records).FailureCategory);
    }

    private static Fixture CreateFixture(AdminLogSourceOptions source, MutableTimeProvider? clock = null)
    {
        clock ??= new MutableTimeProvider(DateTimeOffset.UtcNow);
        var options = new AdminLogsOptions
        {
            Enabled = true,
            Sources = [source],
            AllowedExtensions = [".log", ".txt"],
            MaximumDownloadBytes = 1024,
            MaximumListItems = 10,
            DefaultPageSize = 5,
            MaximumPageSize = 5,
            FileIdLifetimeMinutes = 10,
        };
        var protector = new AdminLogFileIdProtector(new EphemeralDataProtectionProvider(), clock);
        var audit = new CapturingAudit();
        var context = new DefaultHttpContext { TraceIdentifier = "correlation-123" };
        context.User = new ClaimsPrincipal(new ClaimsIdentity(
        [
            new Claim(ClaimTypes.NameIdentifier, "admin-id"),
            new Claim(ClaimTypes.Name, "administrator"),
        ], "test"));
        var service = new AdminLogDownloadService(
            Options.Create(options),
            protector,
            new AdminLogFileOpener(),
            audit,
            new HttpContextAccessor { HttpContext = context },
            clock);
        return new Fixture(service, options, protector, audit, clock);
    }

    private sealed record Fixture(
        AdminLogDownloadService Service,
        AdminLogsOptions Options,
        AdminLogFileIdProtector Protector,
        CapturingAudit Audit,
        MutableTimeProvider Clock)
    {
        public string Protect(string path, TimeSpan? lifetime = null)
        {
            var reader = new AdminLogFileMetadataReader();
            Assert.True(reader.TryReadRegularFile(path, out var metadata));
            var source = Options.Sources.Single();
            return ProtectClaim(new AdminLogFileIdPayload
            {
                SourceKey = source.Key,
                FileName = Path.GetFileName(path),
                RootFingerprint = AdminLogAppService.CreateRootFingerprint(source),
                SizeBytes = metadata.SizeBytes,
                LastModifiedUtc = metadata.LastModifiedUtc,
                DeviceId = metadata.DeviceId,
                Inode = metadata.Inode,
            }, lifetime);
        }

        public string ProtectClaim(AdminLogFileIdPayload payload, TimeSpan? lifetime = null)
            => Protector.Protect(payload, lifetime ?? TimeSpan.FromMinutes(10));
    }

    private sealed class CapturingAudit : IAdminLogDownloadAudit
    {
        public List<AdminLogDownloadAuditRecord> Records { get; } = [];
        public void Write(AdminLogDownloadAuditRecord record) => Records.Add(record);
    }

    private sealed class MutableTimeProvider(DateTimeOffset utcNow) : TimeProvider
    {
        public DateTimeOffset UtcNow { get; set; } = utcNow;
        public override DateTimeOffset GetUtcNow() => UtcNow;
    }

    private sealed class TemporaryDirectory : IDisposable
    {
        private bool _disposed;
        public string Path { get; } = System.IO.Path.Combine(
            System.IO.Path.GetTempPath(), $"teenova-download-service-{Guid.NewGuid():N}");

        public TemporaryDirectory() => Directory.CreateDirectory(Path);

        public string CreateFile(string name, string content)
        {
            var path = System.IO.Path.Combine(Path, name);
            File.WriteAllText(path, content);
            return path;
        }

        public AdminLogSourceOptions Source(string key) => new()
        {
            Key = key,
            DisplayName = key,
            Directory = Path,
        };

        public void Dispose()
        {
            if (_disposed)
                return;
            _disposed = true;
            try { Directory.Delete(Path, recursive: true); }
            catch (Exception exception) when (exception is IOException or UnauthorizedAccessException) { }
        }
    }
}
