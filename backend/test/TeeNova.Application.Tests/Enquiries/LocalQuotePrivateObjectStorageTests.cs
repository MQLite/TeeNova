using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using TeeNova.AiOrderImports.PrivateStorage;
using TeeNova.Enquiries.PrivateStorage;

namespace TeeNova.Enquiries;

public sealed class LocalQuotePrivateObjectStorageTests : IDisposable
{
    private readonly string _contentRoot = Path.Combine(Path.GetTempPath(), "teenova-quote-storage-tests", Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task Saves_with_an_opaque_key_outside_wwwroot_and_reads_back()
    {
        var storage = Create();
        await using var source = new MemoryStream([1, 2, 3]);
        var key = await storage.SaveAsync(source);
        Assert.Matches("^[0-9a-f]{32}$", key);
        Assert.DoesNotContain("wwwroot", key, StringComparison.OrdinalIgnoreCase);
        await using var opened = await storage.OpenReadAsync(key);
        Assert.Equal([1, 2, 3], await ReadAllAsync(opened));
    }

    [Theory]
    [InlineData("../secret")]
    [InlineData("../../wwwroot/file")]
    [InlineData("not-a-guid")]
    [InlineData("https://example.com/file")]
    public async Task Rejects_non_opaque_or_traversing_keys(string key)
    {
        var storage = Create();
        await Assert.ThrowsAsync<ArgumentException>(() => storage.OpenReadAsync(key));
    }

    [Fact]
    public void Refuses_a_root_inside_wwwroot()
    {
        Directory.CreateDirectory(Path.Combine(_contentRoot, "wwwroot"));
        Assert.Throws<InvalidOperationException>(() => Create("wwwroot/quote-requests"));
    }

    [Fact]
    public async Task Readiness_probes_write_read_and_delete()
        => Assert.Equal(PrivateStorageReadinessStatus.Ready, (await Create().CheckReadinessAsync()).Status);

    [Fact]
    public async Task Delete_removes_private_bytes()
    {
        var storage = Create();
        await using var source = new MemoryStream([4, 5, 6]);
        var key = await storage.SaveAsync(source);
        await storage.DeleteAsync(key);
        Assert.False(await storage.ExistsAsync(key));
    }

    private LocalQuotePrivateObjectStorage Create(string root = "App_Data/private/quote-requests")
    {
        Directory.CreateDirectory(_contentRoot);
        return new LocalQuotePrivateObjectStorage(new FakeHostEnvironment(_contentRoot), Options.Create(new QuotePrivateStorageOptions
        {
            RootPath = root, MinimumFreeSpaceBytes = 0, ForbiddenPathPrefixes = ["wwwroot"],
        }));
    }

    private static async Task<byte[]> ReadAllAsync(Stream stream)
    {
        await using var memory = new MemoryStream(); await stream.CopyToAsync(memory); return memory.ToArray();
    }

    public void Dispose() { if (Directory.Exists(_contentRoot)) Directory.Delete(_contentRoot, true); }

    private sealed class FakeHostEnvironment(string root) : IHostEnvironment
    {
        public string EnvironmentName { get; set; } = Environments.Development;
        public string ApplicationName { get; set; } = "TeeNova.Tests";
        public string ContentRootPath { get; set; } = root;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
