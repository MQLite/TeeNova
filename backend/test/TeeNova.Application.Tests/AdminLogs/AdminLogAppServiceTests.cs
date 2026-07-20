using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TeeNova.AdminLogs.Dtos;
using Volo.Abp;

namespace TeeNova.AdminLogs;

public sealed class AdminLogAppServiceTests
{
    [Fact]
    public async Task Disabled_feature_fails_closed_without_enumerating()
    {
        var enumerator = new FakeDirectoryEnumerator { ThrowIfCalled = true };
        var service = CreateService(new AdminLogsOptions(), enumerator: enumerator);

        var exception = await Assert.ThrowsAsync<BusinessException>(() => service.GetListAsync(new GetAdminLogsInput()));

        Assert.Equal(AdminLogsErrorCodes.Disabled, exception.Code);
        Assert.Equal(0, enumerator.CallCount);
    }

    [Fact]
    public async Task Empty_directory_returns_an_empty_available_source()
    {
        using var directory = new TemporaryDirectory();
        var service = CreateService(OptionsFor(Source("api", directory.Path)));

        var result = await service.GetListAsync(new GetAdminLogsInput());

        Assert.Empty(result.Items);
        Assert.Single(result.Sources);
        Assert.True(result.Sources[0].Available);
        Assert.Empty(result.Warnings);
    }

    [Fact]
    public async Task Listing_returns_only_regular_allowlisted_files_with_safe_metadata()
    {
        using var directory = new TemporaryDirectory();
        var modified = new DateTime(2026, 7, 20, 2, 15, 0, DateTimeKind.Utc);
        var logPath = directory.CreateFile("应用.LOG", "hello");
        File.SetLastWriteTimeUtc(logPath, modified);
        directory.CreateFile("ignored.csv", "secret");
        Directory.CreateDirectory(System.IO.Path.Combine(directory.Path, "nested.log"));
        var service = CreateService(OptionsFor(Source("api", directory.Path)));

        var result = await service.GetListAsync(new GetAdminLogsInput());

        var item = Assert.Single(result.Items);
        Assert.Equal("应用.LOG", item.FileName);
        Assert.Equal(5, item.SizeBytes);
        Assert.Equal("api", item.SourceKey);
        Assert.Equal(DateTimeKind.Utc, item.LastModifiedUtc.Kind);
        Assert.DoesNotContain(directory.Path, JsonSerializer.Serialize(result), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Symlink_is_skipped_where_creation_is_supported()
    {
        using var directory = new TemporaryDirectory();
        using var outside = new TemporaryDirectory();
        var target = outside.CreateFile("target.log", "outside");
        var link = System.IO.Path.Combine(directory.Path, "link.log");
        try
        {
            File.CreateSymbolicLink(link, target);
        }
        catch (Exception ex) when (ex is UnauthorizedAccessException or IOException or PlatformNotSupportedException)
        {
            return;
        }

        var service = CreateService(OptionsFor(Source("api", directory.Path)));
        var result = await service.GetListAsync(new GetAdminLogsInput());

        Assert.Empty(result.Items);
    }

    [Fact]
    public async Task Source_filter_and_case_insensitive_filename_search_are_applied()
    {
        var enumerator = new FakeDirectoryEnumerator();
        var metadata = new FakeMetadataReader();
        enumerator.Add("root-a", "Alpha.log", "other.log");
        enumerator.Add("root-b", "alpha-second.log");
        metadata.Add("root-a", "Alpha.log", 1, Utc(1));
        metadata.Add("root-a", "other.log", 2, Utc(2));
        metadata.Add("root-b", "alpha-second.log", 3, Utc(3));
        var options = OptionsFor(Source("api", FullPath("root-a")), Source("web", FullPath("root-b")));
        var service = CreateService(options, enumerator, metadata);

        var result = await service.GetListAsync(new GetAdminLogsInput { Source = "api", Search = "ALPHA" });

        Assert.Equal("Alpha.log", Assert.Single(result.Items).FileName);
        Assert.Equal("api", Assert.Single(result.Sources).Key);
    }

    [Theory]
    [InlineData("fileName", "asc", "a.log")]
    [InlineData("fileName", "desc", "z.log")]
    [InlineData("source", "asc", "a.log")]
    [InlineData("sizeBytes", "desc", "z.log")]
    [InlineData("lastModifiedUtc", "asc", "a.log")]
    public async Task Allowlisted_sort_fields_and_directions_are_applied(string sortBy, string direction, string expectedFirst)
    {
        var enumerator = new FakeDirectoryEnumerator();
        var metadata = new FakeMetadataReader();
        enumerator.Add("root-z", "z.log");
        enumerator.Add("root-a", "a.log");
        metadata.Add("root-z", "z.log", 20, Utc(2));
        metadata.Add("root-a", "a.log", 10, Utc(1));
        var service = CreateService(
            OptionsFor(Source("z-source", FullPath("root-z")), Source("a-source", FullPath("root-a"))),
            enumerator,
            metadata);

        var result = await service.GetListAsync(new GetAdminLogsInput { SortBy = sortBy, SortDirection = direction });

        Assert.Equal(expectedFirst, result.Items[0].FileName);
    }

    [Fact]
    public async Task Default_sort_is_newest_first_and_pagination_is_one_based()
    {
        var enumerator = new FakeDirectoryEnumerator();
        var metadata = new FakeMetadataReader();
        enumerator.Add("root", "old.log", "middle.log", "new.log");
        metadata.Add("root", "old.log", 1, Utc(1));
        metadata.Add("root", "middle.log", 1, Utc(2));
        metadata.Add("root", "new.log", 1, Utc(3));
        var service = CreateService(OptionsFor(Source("api", FullPath("root"))), enumerator, metadata);

        var result = await service.GetListAsync(new GetAdminLogsInput { Page = 2, PageSize = 1 });

        Assert.Equal("middle.log", Assert.Single(result.Items).FileName);
        Assert.Equal(3, result.TotalCount);
        Assert.Equal(2, result.Page);
    }

    [Theory]
    [InlineData(0, 1, null, null)]
    [InlineData(1, 11, null, null)]
    [InlineData(1, 1, "unknown", null)]
    [InlineData(1, 1, null, "sideways")]
    public async Task Invalid_page_or_sort_query_is_rejected(int page, int pageSize, string? sortBy, string? direction)
    {
        var service = CreateService(OptionsFor(Source("api", FullPath("root"))), new FakeDirectoryEnumerator());

        var exception = await Assert.ThrowsAsync<BusinessException>(() => service.GetListAsync(new GetAdminLogsInput
        {
            Page = page,
            PageSize = pageSize,
            SortBy = sortBy,
            SortDirection = direction,
        }));

        Assert.Equal(AdminLogsErrorCodes.InvalidQuery, exception.Code);
    }

    [Fact]
    public async Task Maximum_entry_inspection_limit_sets_truncation_without_unbounded_enumeration()
    {
        var enumerator = new FakeDirectoryEnumerator();
        var metadata = new FakeMetadataReader();
        enumerator.Add("root", "one.log", "two.log", "three.log", "four.log");
        foreach (var name in new[] { "one.log", "two.log", "three.log", "four.log" })
            metadata.Add("root", name, 1, Utc(1));
        var options = OptionsFor(Source("api", FullPath("root")));
        options.MaximumListItems = 2;
        options.MaximumPageSize = 2;
        options.DefaultPageSize = 2;
        var service = CreateService(options, enumerator, metadata);

        var result = await service.GetListAsync(new GetAdminLogsInput());

        Assert.True(result.IsTruncated);
        Assert.True(result.TotalCount <= 2);
        Assert.Equal(3, enumerator.YieldCount);
    }

    [Fact]
    public async Task Missing_selected_source_returns_controlled_unavailable_error()
    {
        var enumerator = new FakeDirectoryEnumerator();
        enumerator.SetUnavailable("missing");
        var service = CreateService(OptionsFor(Source("api", FullPath("missing"))), enumerator);

        var exception = await Assert.ThrowsAsync<BusinessException>(() =>
            service.GetListAsync(new GetAdminLogsInput { Source = "api" }));

        Assert.Equal(AdminLogsErrorCodes.SourceUnavailable, exception.Code);
        Assert.DoesNotContain("missing", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Unknown_source_key_returns_controlled_not_found_error()
    {
        var service = CreateService(OptionsFor(Source("api", FullPath("root"))), new FakeDirectoryEnumerator());

        var exception = await Assert.ThrowsAsync<BusinessException>(() =>
            service.GetListAsync(new GetAdminLogsInput { Source = "unknown" }));

        Assert.Equal(AdminLogsErrorCodes.SourceNotFound, exception.Code);
    }

    [Fact]
    public async Task Missing_source_during_all_source_listing_returns_warning_and_keeps_available_items()
    {
        var enumerator = new FakeDirectoryEnumerator();
        var metadata = new FakeMetadataReader();
        enumerator.SetUnavailable("missing");
        enumerator.Add("available", "good.log");
        metadata.Add("available", "good.log", 7, Utc(1));
        var service = CreateService(
            OptionsFor(Source("missing", FullPath("missing")), Source("api", FullPath("available"))),
            enumerator,
            metadata);

        var result = await service.GetListAsync(new GetAdminLogsInput());

        Assert.Equal("good.log", Assert.Single(result.Items).FileName);
        Assert.False(result.Sources.Single(source => source.Key == "missing").Available);
        Assert.Equal("TeeNova:AdminLogs:SourceUnavailable", Assert.Single(result.Warnings).Code);
    }

    [Fact]
    public async Task File_disappearing_during_enumeration_and_unsafe_control_name_are_skipped()
    {
        var enumerator = new FakeDirectoryEnumerator();
        var metadata = new FakeMetadataReader();
        enumerator.Add("root", "gone.log", "bad\r\nname.log", "good.log");
        metadata.Add("root", "good.log", 7, Utc(1));
        var service = CreateService(OptionsFor(Source("api", FullPath("root"))), enumerator, metadata);

        var result = await service.GetListAsync(new GetAdminLogsInput());

        Assert.Equal("good.log", Assert.Single(result.Items).FileName);
    }

    [Fact]
    public async Task Duplicate_filenames_in_distinct_sources_receive_distinct_opaque_ids_and_tokens_are_not_logged()
    {
        var enumerator = new FakeDirectoryEnumerator();
        var metadata = new FakeMetadataReader();
        var logger = new CapturingLogger<AdminLogAppService>();
        enumerator.Add("root-a", "same.log");
        enumerator.Add("root-b", "same.log");
        metadata.Add("root-a", "same.log", 1, Utc(1));
        metadata.Add("root-b", "same.log", 1, Utc(1));
        var service = CreateService(
            OptionsFor(Source("api", FullPath("root-a")), Source("web", FullPath("root-b"))),
            enumerator,
            metadata,
            logger);

        var result = await service.GetListAsync(new GetAdminLogsInput());

        Assert.Equal(2, result.Items.Count);
        Assert.NotEqual(result.Items[0].Id, result.Items[1].Id);
        foreach (var item in result.Items)
            Assert.DoesNotContain(item.Id, string.Join("\n", logger.Messages), StringComparison.Ordinal);
    }

    [Fact]
    public async Task Oversized_file_is_listed_as_not_downloadable()
    {
        var enumerator = new FakeDirectoryEnumerator();
        var metadata = new FakeMetadataReader();
        enumerator.Add("root", "large.log");
        metadata.Add("root", "large.log", 101, Utc(1));
        var options = OptionsFor(Source("api", FullPath("root")));
        options.MaximumDownloadBytes = 100;
        var service = CreateService(options, enumerator, metadata);

        var item = Assert.Single((await service.GetListAsync(new GetAdminLogsInput())).Items);

        Assert.False(item.Downloadable);
        Assert.Equal("FileTooLarge", item.DownloadBlockReason);
    }

    private static AdminLogAppService CreateService(
        AdminLogsOptions options,
        IAdminLogDirectoryEnumerator? enumerator = null,
        IAdminLogFileMetadataReader? metadata = null,
        ILogger<AdminLogAppService>? logger = null)
    {
        var clock = TimeProvider.System;
        return new AdminLogAppService(
            Options.Create(options),
            enumerator ?? new AdminLogDirectoryEnumerator(),
            metadata ?? new AdminLogFileMetadataReader(),
            new AdminLogFileIdProtector(new EphemeralDataProtectionProvider(), clock),
            new HttpContextAccessor { HttpContext = new DefaultHttpContext() },
            logger ?? new CapturingLogger<AdminLogAppService>());
    }

    private static AdminLogsOptions OptionsFor(params AdminLogSourceOptions[] sources) => new()
    {
        Enabled = true,
        Sources = [.. sources],
        AllowedExtensions = [".log", ".txt", ".json"],
        MaximumDownloadBytes = 1024,
        MaximumListItems = 100,
        DefaultPageSize = 10,
        MaximumPageSize = 10,
        FileIdLifetimeMinutes = 10,
    };

    private static AdminLogSourceOptions Source(string key, string directory) => new()
    {
        Key = key,
        DisplayName = $"{key} logs",
        Directory = directory,
    };

    private static string FullPath(string leaf) => System.IO.Path.GetFullPath(System.IO.Path.Combine(System.IO.Path.GetTempPath(), leaf));
    private static DateTime Utc(int minute) => new(2026, 7, 20, 2, minute, 0, DateTimeKind.Utc);

    private sealed class FakeDirectoryEnumerator : IAdminLogDirectoryEnumerator
    {
        private readonly Dictionary<string, List<string>> _entries = new(PathComparer);
        private readonly HashSet<string> _unavailable = new(PathComparer);
        public bool ThrowIfCalled { get; set; }
        public int CallCount { get; private set; }
        public int YieldCount { get; private set; }

        public void Add(string directoryLeaf, params string[] names)
        {
            var directory = FullPath(directoryLeaf);
            _entries[directory] = names.Select(name => System.IO.Path.Combine(directory, name)).ToList();
        }

        public void SetUnavailable(string directoryLeaf) => _unavailable.Add(FullPath(directoryLeaf));

        public bool Exists(string directory)
        {
            Called();
            return !_unavailable.Contains(directory);
        }

        public IEnumerable<string> EnumerateImmediateEntries(string directory)
        {
            Called();
            if (!_entries.TryGetValue(directory, out var entries))
                yield break;
            foreach (var entry in entries)
            {
                YieldCount++;
                yield return entry;
            }
        }

        private void Called()
        {
            CallCount++;
            if (ThrowIfCalled)
                throw new InvalidOperationException("Filesystem boundary was called.");
        }
    }

    private sealed class FakeMetadataReader : IAdminLogFileMetadataReader
    {
        private readonly Dictionary<string, AdminLogFileMetadata> _metadata = new(PathComparer);

        public void Add(string directoryLeaf, string name, long size, DateTime modified)
            => _metadata[System.IO.Path.Combine(FullPath(directoryLeaf), name)] = new(size, modified, 1, (ulong)_metadata.Count + 1);

        public bool TryReadRegularFile(string path, out AdminLogFileMetadata metadata)
            => _metadata.TryGetValue(path, out metadata!);
    }

    private sealed class TemporaryDirectory : IDisposable
    {
        public string Path { get; } = System.IO.Path.Combine(System.IO.Path.GetTempPath(), $"teenova-adminlogs-{Guid.NewGuid():N}");

        public TemporaryDirectory() => Directory.CreateDirectory(Path);

        public string CreateFile(string name, string content)
        {
            var path = System.IO.Path.Combine(Path, name);
            File.WriteAllText(path, content);
            return path;
        }

        public void Dispose()
        {
            try
            {
                Directory.Delete(Path, recursive: true);
            }
            catch (IOException)
            {
                // Best-effort cleanup of an isolated test directory.
            }
            catch (UnauthorizedAccessException)
            {
                // Best-effort cleanup of an isolated test directory.
            }
        }
    }

    private sealed class CapturingLogger<T> : ILogger<T>
    {
        public List<string> Messages { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception,
            Func<TState, Exception?, string> formatter) => Messages.Add(formatter(state, exception));
    }

    private static StringComparer PathComparer => OperatingSystem.IsWindows()
        ? StringComparer.OrdinalIgnoreCase
        : StringComparer.Ordinal;
}
