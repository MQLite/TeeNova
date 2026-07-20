using System;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;

namespace TeeNova.AdminLogs;

public sealed class AdminLogFileIdPayload
{
    public int Version { get; set; } = 1;
    public string SourceKey { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string RootFingerprint { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public DateTime LastModifiedUtc { get; set; }
    public ulong? DeviceId { get; set; }
    public ulong? Inode { get; set; }
    public DateTimeOffset IssuedUtc { get; set; }
    public DateTimeOffset ExpiresUtc { get; set; }
}

public enum AdminLogFileIdFailure
{
    None,
    Invalid,
    Expired,
    SourceChanged,
}

public interface IAdminLogFileIdProtector
{
    string Protect(AdminLogFileIdPayload payload, TimeSpan lifetime);

    bool TryUnprotect(
        string protectedId,
        out AdminLogFileIdPayload? payload,
        out AdminLogFileIdFailure failure);

    bool TryUnprotect(
        string protectedId,
        string expectedSourceKey,
        string expectedRootFingerprint,
        out AdminLogFileIdPayload? payload,
        out AdminLogFileIdFailure failure);
}

public sealed class AdminLogFileIdProtector : IAdminLogFileIdProtector
{
    public const string Purpose = "TeeNova.AdminLogs.FileId.v1";

    private readonly IDataProtector _protector;
    private readonly TimeProvider _timeProvider;

    public AdminLogFileIdProtector(IDataProtectionProvider provider, TimeProvider timeProvider)
    {
        _protector = provider.CreateProtector(Purpose);
        _timeProvider = timeProvider;
    }

    public string Protect(AdminLogFileIdPayload payload, TimeSpan lifetime)
    {
        var now = _timeProvider.GetUtcNow();
        payload.Version = 1;
        payload.IssuedUtc = now;
        payload.ExpiresUtc = now.Add(lifetime);

        return _protector.Protect(JsonSerializer.Serialize(payload));
    }

    public bool TryUnprotect(
        string protectedId,
        out AdminLogFileIdPayload? payload,
        out AdminLogFileIdFailure failure)
    {
        payload = null;
        failure = AdminLogFileIdFailure.Invalid;

        if (string.IsNullOrWhiteSpace(protectedId))
            return false;

        try
        {
            payload = JsonSerializer.Deserialize<AdminLogFileIdPayload>(_protector.Unprotect(protectedId));
        }
        catch (Exception ex) when (ex is CryptographicException or JsonException or FormatException)
        {
            return false;
        }

        var now = _timeProvider.GetUtcNow();
        if (payload is null
            || payload.Version != 1
            || !IsSafeSourceKey(payload.SourceKey)
            || !IsSafeBasename(payload.FileName)
            || string.IsNullOrWhiteSpace(payload.RootFingerprint)
            || payload.SizeBytes < 0
            || payload.IssuedUtc == default
            || payload.ExpiresUtc == default
            || payload.ExpiresUtc <= payload.IssuedUtc
            || payload.IssuedUtc > now)
        {
            return false;
        }

        if (payload.ExpiresUtc <= now)
        {
            failure = AdminLogFileIdFailure.Expired;
            return false;
        }

        failure = AdminLogFileIdFailure.None;
        return true;
    }

    public bool TryUnprotect(
        string protectedId,
        string expectedSourceKey,
        string expectedRootFingerprint,
        out AdminLogFileIdPayload? payload,
        out AdminLogFileIdFailure failure)
    {
        if (!TryUnprotect(protectedId, out payload, out failure))
            return false;

        if (!string.Equals(payload!.SourceKey, expectedSourceKey, StringComparison.Ordinal)
            || !CryptographicOperations.FixedTimeEquals(
                System.Text.Encoding.UTF8.GetBytes(payload.RootFingerprint),
                System.Text.Encoding.UTF8.GetBytes(expectedRootFingerprint)))
        {
            failure = AdminLogFileIdFailure.SourceChanged;
            return false;
        }

        failure = AdminLogFileIdFailure.None;
        return true;
    }

    public static bool IsSafeSourceKey(string sourceKey)
    {
        if (string.IsNullOrWhiteSpace(sourceKey) || sourceKey.Length > AdminLogsOptionsValidator.MaximumSourceKeyLength)
            return false;

        for (var index = 0; index < sourceKey.Length; index++)
        {
            var character = sourceKey[index];
            if ((character is >= 'a' and <= 'z') || (character is >= '0' and <= '9'))
                continue;
            if (index > 0 && character is '-' or '_')
                continue;
            return false;
        }

        return true;
    }

    public static bool IsSafeBasename(string fileName)
    {
        if (string.IsNullOrWhiteSpace(fileName) || fileName is "." or "..")
            return false;
        if (System.IO.Path.IsPathRooted(fileName)
            || System.IO.Path.IsPathFullyQualified(fileName)
            || fileName.Contains(':'))
            return false;
        if (!string.Equals(fileName, System.IO.Path.GetFileName(fileName), StringComparison.Ordinal))
            return false;
        return fileName.IndexOfAny(['/', '\\', '\0', '\r', '\n']) < 0
               && !ContainsUnsafeControlCharacter(fileName);
    }

    private static bool ContainsUnsafeControlCharacter(string value)
    {
        foreach (var character in value)
        {
            if (char.IsControl(character))
                return true;
        }
        return false;
    }
}
