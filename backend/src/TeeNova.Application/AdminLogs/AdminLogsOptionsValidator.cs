using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace TeeNova.AdminLogs;

public sealed partial class AdminLogsOptionsValidator : IValidateOptions<AdminLogsOptions>
{
    public const int MaximumSources = 32;
    public const int MaximumSourceKeyLength = 64;
    public const int MaximumDisplayNameLength = 128;
    public const int MaximumExtensionLength = 16;
    public const int MaximumFileIdLifetimeMinutes = 24 * 60;

    private readonly ILogger<AdminLogsOptionsValidator> _logger;

    public AdminLogsOptionsValidator(ILogger<AdminLogsOptionsValidator> logger)
    {
        _logger = logger;
    }

    public ValidateOptionsResult Validate(string? name, AdminLogsOptions options)
    {
        if (!options.Enabled)
            return ValidateOptionsResult.Success;

        var failures = new List<string>();

        ValidateSources(options, failures);
        ValidateExtensions(options, failures);
        ValidateLimits(options, failures);

        if (failures.Count == 0)
            return ValidateOptionsResult.Success;

        _logger.LogError(
            "AdminLogs structural configuration validation failed with {FailureCount} error(s).",
            failures.Count);

        return ValidateOptionsResult.Fail(failures);
    }

    private static void ValidateSources(AdminLogsOptions options, List<string> failures)
    {
        if (options.Sources is null || options.Sources.Count == 0)
        {
            failures.Add("AdminLogs requires at least one source when enabled.");
            return;
        }

        if (options.Sources.Count > MaximumSources)
            failures.Add($"AdminLogs supports at most {MaximumSources} configured sources.");

        var keys = new HashSet<string>(StringComparer.Ordinal);
        var directoryComparer = OperatingSystem.IsWindows()
            ? StringComparer.OrdinalIgnoreCase
            : StringComparer.Ordinal;
        var directories = new HashSet<string>(directoryComparer);

        for (var index = 0; index < options.Sources.Count; index++)
        {
            var source = options.Sources[index];
            var label = $"AdminLogs source at index {index}";

            if (source is null)
            {
                failures.Add($"{label} must not be null.");
                continue;
            }

            if (string.IsNullOrWhiteSpace(source.Key))
            {
                failures.Add($"{label} must have a key.");
            }
            else
            {
                if (source.Key.Length > MaximumSourceKeyLength)
                    failures.Add($"{label} key exceeds {MaximumSourceKeyLength} characters.");
                if (!SourceKeyRegex().IsMatch(source.Key))
                    failures.Add($"{label} key must contain only lowercase letters, numbers, dash, or underscore.");
                if (!keys.Add(source.Key))
                    failures.Add($"{label} has a duplicate key.");
            }

            if (string.IsNullOrWhiteSpace(source.DisplayName))
                failures.Add($"{label} must have a display name.");
            else if (source.DisplayName.Length > MaximumDisplayNameLength)
                failures.Add($"{label} display name exceeds {MaximumDisplayNameLength} characters.");

            if (string.IsNullOrWhiteSpace(source.Directory) || !Path.IsPathFullyQualified(source.Directory))
            {
                failures.Add($"{label} directory must be an absolute path.");
                continue;
            }

            try
            {
                var normalized = NormalizeDirectory(source.Directory);
                if (!directories.Add(normalized))
                    failures.Add($"{label} has a duplicate normalized directory.");
            }
            catch (Exception ex) when (ex is ArgumentException or NotSupportedException or PathTooLongException)
            {
                failures.Add($"{label} directory is not structurally valid.");
            }
        }
    }

    private static void ValidateExtensions(AdminLogsOptions options, List<string> failures)
    {
        if (options.AllowedExtensions is null || options.AllowedExtensions.Count == 0)
        {
            failures.Add("AdminLogs allowed extensions must not be empty when enabled.");
            return;
        }

        var extensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        for (var index = 0; index < options.AllowedExtensions.Count; index++)
        {
            var extension = options.AllowedExtensions[index];
            var label = $"AdminLogs extension at index {index}";

            if (string.IsNullOrWhiteSpace(extension))
            {
                failures.Add($"{label} must start with a dot.");
                continue;
            }
            if (!extension.StartsWith(".", StringComparison.Ordinal))
                failures.Add($"{label} must start with a dot.");
            if (extension.Length > MaximumExtensionLength)
                failures.Add($"{label} exceeds {MaximumExtensionLength} characters.");
            if (extension.IndexOfAny(['/', '\\', '\0']) >= 0 || extension.Any(char.IsControl))
                failures.Add($"{label} contains an unsafe character.");
            if (!extensions.Add(extension))
                failures.Add($"{label} is duplicated.");
        }
    }

    private static void ValidateLimits(AdminLogsOptions options, List<string> failures)
    {
        if (options.MaximumDownloadBytes <= 0)
            failures.Add("AdminLogs maximum download bytes must be positive.");
        if (options.MaximumListItems <= 0)
            failures.Add("AdminLogs maximum list items must be positive.");
        if (options.DefaultPageSize <= 0)
            failures.Add("AdminLogs default page size must be positive.");
        if (options.MaximumPageSize <= 0)
            failures.Add("AdminLogs maximum page size must be positive.");
        if (options.DefaultPageSize > options.MaximumPageSize)
            failures.Add("AdminLogs default page size must not exceed maximum page size.");
        if (options.MaximumPageSize > options.MaximumListItems)
            failures.Add("AdminLogs maximum page size must not exceed maximum list items.");
        if (options.FileIdLifetimeMinutes <= 0 || options.FileIdLifetimeMinutes > MaximumFileIdLifetimeMinutes)
            failures.Add($"AdminLogs file ID lifetime must be between 1 and {MaximumFileIdLifetimeMinutes} minutes.");
    }

    internal static string NormalizeDirectory(string directory)
    {
        var root = Path.GetPathRoot(directory);
        var normalized = Path.GetFullPath(directory);
        if (!string.Equals(normalized, root, StringComparison.Ordinal))
            normalized = normalized.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return OperatingSystem.IsWindows() ? normalized.ToUpperInvariant() : normalized;
    }

    [GeneratedRegex("^[a-z0-9][a-z0-9_-]*$", RegexOptions.CultureInvariant)]
    private static partial Regex SourceKeyRegex();
}
