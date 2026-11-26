using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.Sqlite;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Primitives;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.PixelFormats;
using TeeNova.AiOrderImports.PrivateStorage;
using TeeNova.Auth;
using TeeNova.Reception;

namespace TeeNova.Tests.Reception;

public sealed class ManualArtworkUploadTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), "teenova-local-artwork-" + Guid.NewGuid());
    private readonly ReceptionSheet sheet = new(Guid.NewGuid(), "Customer", "", null, "");
    private readonly Guid uploadId = Guid.NewGuid();

    [Theory]
    [InlineData(nameof(GmailReceptionController.UploadToSheet))]
    [InlineData(nameof(GmailReceptionController.UploadPending))]
    public void Upload_requires_the_admin_role(string method)
    {
        var auth = typeof(GmailReceptionController).GetMethod(method)!.GetCustomAttribute<AuthorizeAttribute>()!;
        Assert.Equal(TeeNovaRoles.Admin, auth.Roles);
    }

    [Fact]
    public async Task Standalone_upload_keeps_original_names_and_bytes_and_retry_does_not_recreate_removed_files()
    {
        using var image = new Image<Rgba32>(10, 10);
        using var png = new MemoryStream();
        using var jpeg = new MemoryStream();
        using var webp = new MemoryStream();
        image.SaveAsPng(png);
        image.SaveAsJpeg(jpeg);
        image.SaveAsWebp(webp);
        var pdf = await File.ReadAllBytesAsync(Path.Combine(AppContext.BaseDirectory, "Reception", "worksheet.pdf"));
        var input = new[] { ("正面.PNG", png.ToArray()), ("back.jpg", jpeg.ToArray()), ("logo.webp", webp.ToArray()), ("proof.pdf", pdf) };
        var (controller, store) = Controller();
        controller.Request.Form = Form(input);
        Assert.IsType<OkObjectResult>(await controller.UploadPending(default));
        var queue = store.Pending();
        Assert.Equal(4, queue.Count);
        Assert.All(queue, f => { Assert.Equal("本地上传", f.Sender); Assert.Equal("", f.Subject); Assert.Equal("upload", f.Source); });
        foreach (var (name, bytes) in input)
        {
            var row = queue.Single(f => f.Name == name);
            Assert.Equal(bytes, store.Read(Guid.Empty, row.Id)!.Value.Bytes);
        }
        Assert.True(store.Assign(queue[0].Id, sheet.Id, false));
        Assert.True(store.Remove(Guid.Empty, queue[1].Id));
        controller.Request.Form = Form(input);
        Assert.IsType<OkObjectResult>(await controller.UploadPending(default));
        Assert.Equal(2, store.Pending().Count);
        Assert.Single(store.List(sheet.Id));
        store.ReturnFromDeletedSheet(sheet.Id);
        Assert.Contains(store.Pending(), file => file.Source == "return" && file.Subject.Contains(sheet.Id.ToString()[..8]));
    }

    [Fact]
    public async Task Oversized_mixed_batch_archives_only_the_large_file_compressed_and_remembers_its_original()
    {
        using var image = new Image<Rgba32>(1600, 1500, new Rgba32(90, 130, 74, 128));
        using var encoded = new MemoryStream();
        image.SaveAsPng(encoded, new PngEncoder { CompressionLevel = PngCompressionLevel.NoCompression });
        var png = encoded.ToArray();
        Assert.True(png.Length > ManualArtworkUpload.MaxBytes);
        var pdf = await File.ReadAllBytesAsync(Path.Combine(AppContext.BaseDirectory, "Reception", "worksheet.pdf"));
        var (controller, store) = Controller();
        controller.Request.Form = Form(("proof.pdf", pdf), ("shirt.png", png));
        Assert.IsType<OkObjectResult>(await controller.UploadToSheet(sheet.Id, default));
        var files = store.List(sheet.Id);
        Assert.Equal(2, files.Count);
        Assert.Equal(pdf, store.Read(sheet.Id, Guid.Parse(files.Single(f => f.Name == "proof.pdf").Id))!.Value.Bytes);
        var stored = store.Read(sheet.Id, Guid.Parse(files.Single(f => f.Name == "shirt.png").Id))!.Value.Bytes;
        Assert.InRange(stored.Length, 1, ManualArtworkUpload.MaxBytes - pdf.Length);
        using var decoded = Image.Load<Rgba32>(stored);
        Assert.Equal(image.Size, decoded.Size);
        Assert.Equal(image[100, 100], decoded[100, 100]);
        Assert.IsType<OkObjectResult>(await controller.UploadToSheet(sheet.Id, default));
        Assert.Equal(2, store.List(sheet.Id).Count);
        controller.Request.Form = Form(("proof.pdf", pdf), ("shirt.png", stored));
        Assert.IsType<ConflictObjectResult>(await controller.UploadToSheet(sheet.Id, default));
    }

    [Fact]
    public async Task A_batch_that_cannot_fit_without_losing_animation_is_rejected_atomically()
    {
        using var image = new Image<Rgba32>(1200, 1100, Color.Red);
        using var second = new Image<Rgba32>(image.Width, image.Height, Color.Blue);
        image.Frames.AddFrame(second.Frames.RootFrame);
        using var encoded = new MemoryStream();
        image.SaveAsPng(encoded, new PngEncoder { CompressionLevel = PngCompressionLevel.NoCompression });
        var animation = encoded.ToArray();
        Assert.True(animation.Length > ManualArtworkUpload.MaxBytes);
        var pdf = await File.ReadAllBytesAsync(Path.Combine(AppContext.BaseDirectory, "Reception", "worksheet.pdf"));
        var (controller, store) = Controller();
        controller.Request.Form = Form(("proof.pdf", pdf), ("animated.png", animation));
        var rejection = Assert.IsType<BadRequestObjectResult>(await controller.UploadPending(default));
        Assert.Contains("自动压缩后仍超过 8 MiB", rejection.Value!.ToString());
        Assert.Empty(store.Pending());
        controller.Request.Form = Form(("proof.pdf", pdf));
        Assert.IsType<OkObjectResult>(await controller.UploadPending(default));
        Assert.Single(store.Pending());
    }

    [Fact]
    public async Task Direct_upload_uses_the_configured_store_and_rejects_a_changed_target_or_batch()
    {
        var configured = Path.Combine(root, "existing-store");
        var (controller, _) = Controller(configured);
        var store = new GmailArtworkStore(configured);
        var pdf = await File.ReadAllBytesAsync(Path.Combine(AppContext.BaseDirectory, "Reception", "worksheet.pdf"));
        controller.Request.Form = Form(("proof.pdf", pdf));
        Assert.IsType<NotFoundObjectResult>(await controller.UploadToSheet(Guid.NewGuid(), default));
        Assert.IsType<OkObjectResult>(await controller.UploadToSheet(sheet.Id, default));
        Assert.IsType<ConflictObjectResult>(await controller.UploadPending(default));
        controller.Request.Form = Form(("changed.pdf", pdf));
        Assert.IsType<ConflictObjectResult>(await controller.UploadToSheet(sheet.Id, default));
        controller.Request.Form = Form(("proof.pdf", pdf));
        Assert.IsType<OkObjectResult>(await controller.UploadToSheet(sheet.Id, default));
        Assert.Empty(store.Pending());
        var file = Assert.Single(store.ListForSheets([sheet.Id])[sheet.Id]);
        Assert.Equal("upload", file.Source);
        Assert.Equal(pdf, store.Read(sheet.Id, Guid.Parse(file.Id))!.Value.Bytes);
    }

    [Fact]
    public async Task Invalid_batches_leave_no_files_and_allow_a_corrected_retry()
    {
        var (controller, store) = Controller();
        var pdf = await File.ReadAllBytesAsync(Path.Combine(AppContext.BaseDirectory, "Reception", "worksheet.pdf"));
        foreach (var invalid in new[] { ("empty.pdf", Array.Empty<byte>()), ("invalid.pdf", "%PDF-fake"u8.ToArray()),
                     ("wrong.png", pdf), ("unsupported.psd", pdf), ("oversize.pdf", new byte[ManualArtworkUpload.MaxBytes]) })
        {
            controller.Request.Form = Form(("valid.pdf", pdf), invalid);
            Assert.IsType<BadRequestObjectResult>(await controller.UploadPending(default));
            Assert.Empty(store.Pending());
        }
        controller.Request.Form = Form(Enumerable.Repeat(("proof.pdf", pdf), 11).ToArray());
        Assert.IsType<BadRequestObjectResult>(await controller.UploadPending(default));
        controller.Request.Form = Form(("valid.pdf", pdf));
        Assert.IsType<OkObjectResult>(await controller.UploadPending(default));
        Assert.Single(store.Pending());
    }

    private (GmailReceptionController, GmailArtworkStore) Controller(string? configured = null)
    {
        Directory.CreateDirectory(root);
        var environment = Host.CreateApplicationBuilder(new HostApplicationBuilderSettings { ContentRootPath = root }).Environment;
        var config = new ConfigurationBuilder().AddInMemoryCollection(
            new Dictionary<string, string?> { ["GmailReception:PrivateDirectory"] = configured }).Build();
        var options = Options.Create(new PrivateObjectStorageOptions());
        var controller = new GmailReceptionController(ReceptionSheetSourceTextTests.SingleEntityRepository<ReceptionSheet>.For(sheet),
            config, environment, options)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
        controller.Request.ContentType = "multipart/form-data; boundary=test";
        return (controller, GmailArtworkStore.Configured(config, environment, options));
    }

    private FormCollection Form(params (string Name, byte[] Content)[] files)
    {
        var uploads = new FormFileCollection();
        foreach (var (name, content) in files)
            uploads.Add(new FormFile(new MemoryStream(content), 0, content.Length, $"file{uploads.Count}", name));
        return new FormCollection(new Dictionary<string, StringValues> { ["uploadId"] = uploadId.ToString() }, uploads);
    }

    public void Dispose()
    {
        SqliteConnection.ClearAllPools();
        if (Directory.Exists(root)) Directory.Delete(root, true);
    }
}
