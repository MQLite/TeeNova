using Microsoft.Extensions.Logging.Abstractions;

namespace TeeNova.AdminLogs;

public sealed class AdminLogsOptionsValidatorTests
{
    private readonly AdminLogsOptionsValidator _validator = new(NullLogger<AdminLogsOptionsValidator>.Instance);

    [Fact]
    public void Disabled_configuration_with_no_sources_is_valid()
    {
        Assert.True(_validator.Validate(null, new AdminLogsOptions()).Succeeded);
    }

    [Theory]
    [MemberData(nameof(InvalidConfigurations))]
    public void Enabled_structurally_invalid_configuration_is_rejected(Action<AdminLogsOptions> mutate)
    {
        var options = ValidOptions();
        mutate(options);

        var result = _validator.Validate(null, options);

        Assert.True(result.Failed);
        Assert.NotEmpty(result.Failures);
    }

    [Fact]
    public void Enabled_configuration_tolerates_duplicate_and_merged_extensions()
    {
        var options = ValidOptions();
        // Reproduces .NET configuration array merging of appsettings.json with environment variables
        // (AdminLogs__AllowedExtensions__3..): the same extensions, including a case variant, appended
        // again. This must not fail startup because consumers resolve extensions case-insensitively.
        options.AllowedExtensions.AddRange([".LOG", ".log", ".txt", ".json"]);

        var result = _validator.Validate(null, options);

        Assert.True(result.Succeeded, string.Join("; ", result.Failures ?? []));
    }

    public static IEnumerable<object[]> InvalidConfigurations()
    {
        yield return Case(options => options.Sources.Clear());
        yield return Case(options => options.Sources = null!);
        yield return Case(options => options.Sources.Add(CloneSource(options.Sources[0])));
        yield return Case(options => options.Sources[0].Key = " ");
        yield return Case(options => options.Sources[0].Key = "API/Logs");
        yield return Case(options => options.Sources[0].Key = new string('a', AdminLogsOptionsValidator.MaximumSourceKeyLength + 1));
        yield return Case(options => options.Sources[0].DisplayName = " ");
        yield return Case(options => options.Sources[0].DisplayName = new string('a', AdminLogsOptionsValidator.MaximumDisplayNameLength + 1));
        yield return Case(options => options.Sources[0].Directory = "relative/logs");
        yield return Case(options => options.Sources.Add(new AdminLogSourceOptions
        {
            Key = "other",
            DisplayName = "Other",
            Directory = options.Sources[0].Directory + Path.DirectorySeparatorChar,
        }));
        yield return Case(options => options.AllowedExtensions.Clear());
        yield return Case(options => options.AllowedExtensions = null!);
        yield return Case(options => options.AllowedExtensions[0] = "log");
        yield return Case(options => options.AllowedExtensions[0] = ".lo/g");
        yield return Case(options => options.AllowedExtensions[0] = ".log\0");
        yield return Case(options => options.MaximumDownloadBytes = 0);
        yield return Case(options => options.MaximumListItems = 0);
        yield return Case(options => options.DefaultPageSize = 0);
        yield return Case(options => options.MaximumPageSize = 0);
        yield return Case(options => options.DefaultPageSize = options.MaximumPageSize + 1);
        yield return Case(options => options.MaximumPageSize = options.MaximumListItems + 1);
        yield return Case(options => options.FileIdLifetimeMinutes = 0);
        yield return Case(options => options.FileIdLifetimeMinutes = AdminLogsOptionsValidator.MaximumFileIdLifetimeMinutes + 1);
    }

    private static object[] Case(Action<AdminLogsOptions> mutate) => [mutate];

    private static AdminLogsOptions ValidOptions() => new()
    {
        Enabled = true,
        Sources =
        [
            new AdminLogSourceOptions
            {
                Key = "api",
                DisplayName = "API Logs",
                Directory = Path.GetFullPath(Path.Combine(Path.GetTempPath(), "teenova-options-test")),
            },
        ],
        AllowedExtensions = [".log", ".txt", ".json"],
        MaximumDownloadBytes = 1024,
        MaximumListItems = 20,
        DefaultPageSize = 5,
        MaximumPageSize = 10,
        FileIdLifetimeMinutes = 10,
    };

    private static AdminLogSourceOptions CloneSource(AdminLogSourceOptions source) => new()
    {
        Key = source.Key,
        DisplayName = source.DisplayName,
        Directory = source.Directory,
    };
}
