using System;
using System.IO;
using System.Text;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using TeeNova.AiOrderImports.PrivateStorage;

namespace TeeNova.AiOrderImports.Tests;

public sealed class LocalPrivateObjectStorageTests : IDisposable
{
    private readonly string _contentRoot =
        Path.Combine(Path.GetTempPath(), $"teenova-private-storage-tests-{Guid.NewGuid():N}");

    [Fact]
    public async Task Saves_outside_wwwroot_with_opaque_non_url_key()
    {
        var storage = CreateStorage("private/ai-order-imports");
        await using var input = new MemoryStream(Encoding.UTF8.GetBytes("private evidence"));

        var key = await storage.SaveAsync(input, PrivateObjectCategory.SourceDocument);

        Assert.Matches("^source-documents/[0-9a-f]{32}$", key);
        Assert.DoesNotContain("http", key, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("private evidence", key);
        Assert.False(File.Exists(Path.Combine(_contentRoot, "wwwroot", key)));

        await using var saved = await storage.OpenReadAsync(key);
        using var reader = new StreamReader(saved);
        Assert.Equal("private evidence", await reader.ReadToEndAsync());
    }

    [Fact]
    public async Task Repeated_saves_never_overwrite_an_existing_object()
    {
        var storage = CreateStorage("private/ai-order-imports");

        var firstKey = await storage.SaveAsync(
            new MemoryStream(Encoding.UTF8.GetBytes("first")),
            PrivateObjectCategory.RawProviderEvidence);
        var secondKey = await storage.SaveAsync(
            new MemoryStream(Encoding.UTF8.GetBytes("second")),
            PrivateObjectCategory.RawProviderEvidence);

        Assert.NotEqual(firstKey, secondKey);
        await using var first = await storage.OpenReadAsync(firstKey);
        using var reader = new StreamReader(first);
        Assert.Equal("first", await reader.ReadToEndAsync());
    }

    [Theory]
    [InlineData("../secret")]
    [InlineData("source-documents/../../secret")]
    [InlineData("/source-documents/00000000000000000000000000000000")]
    [InlineData("source-documents/not-a-guid")]
    [InlineData("unknown/00000000000000000000000000000000")]
    public async Task Rejects_traversal_and_unissued_key_shapes(string key)
    {
        var storage = CreateStorage("private/ai-order-imports");

        await Assert.ThrowsAsync<ArgumentException>(() => storage.OpenReadAsync(key));
        await Assert.ThrowsAsync<ArgumentException>(() => storage.DeleteAsync(key));
    }

    [Fact]
    public async Task Delete_is_idempotent()
    {
        var storage = CreateStorage("private/ai-order-imports");
        var key = await storage.SaveAsync(
            new MemoryStream([1, 2, 3]),
            PrivateObjectCategory.SourceDocument);

        await storage.DeleteAsync(key);
        await storage.DeleteAsync(key);

        Assert.False(await storage.ExistsAsync(key));
    }

    [Fact]
    public async Task Readiness_probe_writes_reads_deletes_and_leaves_no_object()
    {
        var storage = CreateStorage("private/ai-order-imports");

        var result = await storage.CheckReadinessAsync();

        Assert.Equal(PrivateStorageReadinessStatus.Ready, result.Status);
        var rawDirectory = Path.Combine(
            _contentRoot,
            "private",
            "ai-order-imports",
            "raw-provider-evidence");
        Assert.Empty(Directory.GetFiles(rawDirectory));
    }

    [Fact]
    public async Task Readiness_reports_low_space_without_exposing_a_path()
    {
        var storage = CreateStorage(
            "private/ai-order-imports",
            minimumFreeSpaceBytes: long.MaxValue);

        var result = await storage.CheckReadinessAsync();

        Assert.Equal(PrivateStorageReadinessStatus.LowSpace, result.Status);
        Assert.DoesNotContain(_contentRoot, result.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public async Task Readiness_rejects_an_existing_insecure_unix_root()
    {
        if (OperatingSystem.IsWindows())
            return;

        var root = Path.Combine(_contentRoot, "private", "ai-order-imports");
        Directory.CreateDirectory(root);
        File.SetUnixFileMode(
            root,
            UnixFileMode.UserRead |
            UnixFileMode.UserWrite |
            UnixFileMode.UserExecute |
            UnixFileMode.GroupRead);
        var storage = CreateStorage("private/ai-order-imports");

        var result = await storage.CheckReadinessAsync();

        Assert.Equal(PrivateStorageReadinessStatus.UnsafeLocation, result.Status);
    }

    [Fact]
    public void Missing_root_configuration_fails_closed()
    {
        Assert.Throws<InvalidOperationException>(() =>
            CreateStorage(null));
    }

    [Theory]
    [InlineData("wwwroot/private-ai")]
    [InlineData("wwwroot")]
    public void Public_root_configuration_fails_closed(string configuredRoot)
    {
        Assert.Throws<InvalidOperationException>(() =>
            CreateStorage(configuredRoot));
    }

    public void Dispose()
    {
        if (Directory.Exists(_contentRoot))
            Directory.Delete(_contentRoot, recursive: true);
    }

    private LocalPrivateObjectStorage CreateStorage(
        string? configuredRoot,
        long minimumFreeSpaceBytes = 0)
    {
        Directory.CreateDirectory(_contentRoot);
        var environment = new FakeHostEnvironment(_contentRoot);
        var options = Options.Create(new PrivateObjectStorageOptions
        {
            RootPath = configuredRoot,
            MinimumFreeSpaceBytes = minimumFreeSpaceBytes,
        });
        return new LocalPrivateObjectStorage(environment, options);
    }

    private sealed class FakeHostEnvironment(string contentRoot) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "TeeNova.Tests";
        public string ContentRootPath { get; set; } = contentRoot;
        public IFileProvider ContentRootFileProvider { get; set; } =
            new NullFileProvider();
    }
}
