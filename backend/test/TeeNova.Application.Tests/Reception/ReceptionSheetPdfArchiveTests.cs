using System.Net;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TeeNova.Auth;
using TeeNova.EntityFrameworkCore;
using TeeNova.Reception;
using Volo.Abp.AspNetCore.Mvc;
using Volo.Abp.Autofac;
using Volo.Abp.EntityFrameworkCore;
using Volo.Abp.Modularity;
using Volo.Abp.Uow;

namespace TeeNova.Tests.Reception;

public sealed class ReceptionSheetPdfArchiveTests
{
    [Fact]
    public async Task Archive_routes_require_the_reception_admin_role()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddAuthentication("test").AddScheme<AuthenticationSchemeOptions, TestAuthentication>("test", null);
        builder.Services.AddAuthorization();
        builder.Services.AddControllers().AddApplicationPart(typeof(ReceptionSheetsController).Assembly);
        await using var app = builder.Build();
        app.UseAuthentication();
        app.UseAuthorization();
        app.MapControllers();
        await app.StartAsync();

        using var client = app.GetTestClient();
        var route = $"/api/admin/reception-sheets/{Guid.NewGuid()}/pdfs";
        var file = $"{route}/{Guid.NewGuid()}";
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(route)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(file)).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.GetAsync(file + "/pages/1")).StatusCode);
        Assert.Equal(HttpStatusCode.Unauthorized, (await client.PostAsJsonAsync(route, new { version = "first" })).StatusCode);
        client.DefaultRequestHeaders.Add("X-Test-User", "staff");
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(file)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await client.GetAsync(file + "/pages/1")).StatusCode);
    }

    [Fact]
    public async Task Renders_the_selected_archived_page_after_edits_without_regenerating_the_pdf()
    {
        await using var fixture = await ArchiveFixture.Create();
        var sheet = await fixture.Save("Worksheet", null);
        using var source = PdfSharp.Pdf.IO.PdfReader.Open(
            Path.Combine(AppContext.BaseDirectory, "Reception", "worksheet.pdf"), PdfSharp.Pdf.IO.PdfDocumentOpenMode.Import);
        using var document = new PdfSharp.Pdf.PdfDocument();
        document.AddPage(source.Pages[0]);
        document.AddPage();
        using var buffer = new MemoryStream();
        document.Save(buffer);
        fixture.Generator.Output = new(buffer.ToArray(), 2);
        fixture.Generator.Resume.TrySetResult();
        var pdf = await ReadInfo(await fixture.Generate(sheet.Version));
        await fixture.Save("Changed worksheet", null, sheet.Version);

        var pages = $"{fixture.ArchiveRoute}/{pdf.Id}/pages";
        var pageOne = await fixture.Client.GetAsync(pages + "/1");
        pageOne.EnsureSuccessStatusCode();
        Assert.Equal("image/png", pageOne.Content.Headers.ContentType?.MediaType);
        Assert.True(pageOne.Headers.CacheControl?.NoStore);
        Assert.True(pageOne.Headers.CacheControl?.Private);
        var first = await pageOne.Content.ReadAsByteArrayAsync();
        var second = await fixture.Client.GetByteArrayAsync(pages + "/2");
        byte[] pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
        Assert.True(first.AsSpan().StartsWith(pngSignature));
        Assert.True(second.AsSpan().StartsWith(pngSignature));
        Assert.False(first.SequenceEqual(second));
        Assert.Equal(HttpStatusCode.NotFound, (await fixture.Client.GetAsync(pages + "/0")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await fixture.Client.GetAsync(pages + "/3")).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await fixture.Client.GetAsync(
            $"/api/admin/reception-sheets/{Guid.NewGuid()}/pdfs/{pdf.Id}/pages/1")).StatusCode);
        Assert.Equal(1, fixture.Generator.Calls);
    }

    [Fact]
    public async Task Concurrent_requests_reuse_one_archive_and_saved_snapshot_survives_later_edits()
    {
        await using var fixture = await ArchiveFixture.Create();
        var original = await fixture.Save("Original customer", "NZ$150");
        var first = fixture.Generate(original.Version);
        await fixture.Generator.Started.Task.WaitAsync(TimeSpan.FromSeconds(10));
        var second = fixture.Generate(original.Version);
        var changed = await fixture.Save("Updated customer", "NZ$200", original.Version);
        fixture.Generator.Resume.TrySetResult();

        var initialPdf = await ReadInfo(await first);
        Assert.False(initialPdf.IsCurrent);
        Assert.Equal(initialPdf, await ReadInfo(await second));
        Assert.Equal(initialPdf, await ReadInfo(await fixture.Generate(original.Version)));
        Assert.Equal(1, fixture.Generator.Calls);
        Assert.Equal(original.Version, initialPdf.Version);
        Assert.NotEqual(changed.Version, initialPdf.Version);

        var preview = await fixture.Client.GetAsync($"{fixture.ArchiveRoute}/{initialPdf.Id}");
        Assert.Equal("inline", preview.Content.Headers.ContentDisposition?.DispositionType);
        Assert.Equal("application/pdf", preview.Content.Headers.ContentType?.MediaType);
        Assert.True(preview.Headers.CacheControl?.NoStore);
        var bytes = await preview.Content.ReadAsByteArrayAsync();
        var printed = Encoding.UTF8.GetString(bytes);
        Assert.Contains("Original customer", printed);
        Assert.Contains("NZ$150", printed);
        Assert.DoesNotContain("Updated customer", printed);
        var download = await fixture.Client.GetAsync($"{fixture.ArchiveRoute}/{initialPdf.Id}?download=true");
        Assert.Equal("attachment", download.Content.Headers.ContentDisposition?.DispositionType);
        Assert.Equal(bytes, await download.Content.ReadAsByteArrayAsync());

        var latestPdf = await ReadInfo(await fixture.Generate(changed.Version));
        Assert.True(latestPdf.IsCurrent);
        Assert.Equal(changed.Version, latestPdf.Version);
        Assert.NotEqual(initialPdf.Id, latestPdf.Id);
        Assert.Equal(new[] { latestPdf, initialPdf }, await fixture.Client.GetFromJsonAsync<ReceptionSheetPdfInfo[]>(fixture.ArchiveRoute));
    }

    [Fact]
    public async Task New_print_template_regenerates_even_when_the_saved_sheet_is_unchanged()
    {
        await using var fixture = await ArchiveFixture.Create();
        var sheet = await fixture.Save("Worksheet", null);
        fixture.Generator.Resume.TrySetResult();
        var previous = await ReadInfo(await fixture.Generate(sheet.Version));
        fixture.ExecuteSql("UPDATE ReceptionSheetPdfs SET Template = 'previous-template'");
        var current = await ReadInfo(await fixture.Generate(sheet.Version));

        Assert.NotEqual(previous.Id, current.Id);
        var history = await fixture.Client.GetFromJsonAsync<ReceptionSheetPdfInfo[]>(fixture.ArchiveRoute);
        Assert.NotNull(history);
        Assert.True(history.Single(pdf => pdf.Id == current.Id).IsCurrent);
        Assert.False(history.Single(pdf => pdf.Id == previous.Id).IsCurrent);
        Assert.Equal(HttpStatusCode.OK, (await fixture.Client.GetAsync($"{fixture.ArchiveRoute}/{previous.Id}")).StatusCode);
    }

    [Fact]
    public async Task Stale_unarchived_version_and_cross_sheet_file_access_are_rejected()
    {
        await using var fixture = await ArchiveFixture.Create();
        var original = await fixture.Save("Original customer", null);
        var changed = await fixture.Save("Updated customer", null, original.Version);
        Assert.Equal(HttpStatusCode.Conflict, (await fixture.Generate(original.Version)).StatusCode);
        Assert.Equal(0, fixture.Generator.Calls);

        fixture.Generator.Resume.TrySetResult();
        var pdf = await ReadInfo(await fixture.Generate(changed.Version));
        var other = Guid.NewGuid();
        (await fixture.Client.PutAsJsonAsync($"/api/admin/reception-sheets/{other}", new { customer = "Other" })).EnsureSuccessStatusCode();
        var belongsElsewhere = await fixture.Client.GetAsync($"/api/admin/reception-sheets/{other}/pdfs/{pdf.Id}");
        Assert.Equal(HttpStatusCode.NotFound, belongsElsewhere.StatusCode);
    }

    [Fact]
    public async Task Losing_the_generation_response_does_not_discard_or_duplicate_the_paid_render()
    {
        await using var fixture = await ArchiveFixture.Create();
        var sheet = await fixture.Save("Example customer", null);
        var request = fixture.GenerateWithSimulatedDisconnect(sheet.Version);
        await fixture.Generator.Started.Task.WaitAsync(TimeSpan.FromSeconds(10));
        fixture.DisconnectRequest();
        fixture.Generator.Resume.TrySetResult();
        await request.WaitAsync(TimeSpan.FromSeconds(10));

        var recovered = await ReadInfo(await fixture.Generate(sheet.Version));
        Assert.Equal(sheet.Version, recovered.Version);
        Assert.Equal(1, fixture.Generator.Calls);
    }

    [Fact]
    public async Task Storage_failure_leaves_no_downloadable_pdf_and_same_version_can_retry()
    {
        await using var fixture = await ArchiveFixture.Create();
        var sheet = await fixture.Save("Example customer", null);
        fixture.ExecuteSql("""
            CREATE TRIGGER FailPdfWrite BEFORE UPDATE OF Content ON ReceptionSheetPdfs
            BEGIN SELECT RAISE(ABORT, 'TEST STORAGE OUTAGE'); END;
            """);
        fixture.Generator.Resume.TrySetResult();
        var failure = await fixture.Generate(sheet.Version);
        Assert.Equal(HttpStatusCode.ServiceUnavailable, failure.StatusCode);
        Assert.Empty((await fixture.Client.GetFromJsonAsync<ReceptionSheetPdfInfo[]>(fixture.ArchiveRoute))!);
        Assert.DoesNotContain("TEST STORAGE OUTAGE", await failure.Content.ReadAsStringAsync());

        fixture.ExecuteSql("DROP TRIGGER FailPdfWrite;");
        var result = await ReadInfo(await fixture.Generate(sheet.Version));
        Assert.Equal(sheet.Version, result.Version);
        Assert.Equal(2, fixture.Generator.Calls);
    }

    [Fact]
    public async Task Deleting_a_sheet_removes_existing_archives_and_prevents_in_progress_publication()
    {
        await using var fixture = await ArchiveFixture.Create();
        var prior = await fixture.Save("Before edit", null);
        fixture.Generator.Resume.TrySetResult();
        var archived = await ReadInfo(await fixture.Generate(prior.Version));

        fixture.Generator.ResetPause();
        var current = await fixture.Save("After edit", null, prior.Version);
        var inProgress = fixture.Generate(current.Version);
        await fixture.Generator.Started.Task.WaitAsync(TimeSpan.FromSeconds(10));
        var deleted = await fixture.Client.DeleteAsync($"{fixture.SheetRoute}?version={current.Version}");
        Assert.Equal(HttpStatusCode.NoContent, deleted.StatusCode);
        fixture.Generator.Resume.TrySetResult();

        Assert.Equal(HttpStatusCode.NotFound, (await inProgress).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await fixture.Client.GetAsync(fixture.ArchiveRoute)).StatusCode);
        Assert.Equal(HttpStatusCode.NotFound, (await fixture.Client.GetAsync($"{fixture.ArchiveRoute}/{archived.Id}")).StatusCode);
        Assert.Equal(0L, fixture.ExecuteSql("SELECT COUNT(*) FROM ReceptionSheetPdfs;"));
    }

    private static async Task<ReceptionSheetPdfInfo> ReadInfo(HttpResponseMessage response)
    {
        response.EnsureSuccessStatusCode();
        return (await response.Content.ReadFromJsonAsync<ReceptionSheetPdfInfo>())!;
    }

    private sealed class ArchiveFixture(WebApplication app, SqliteConnection database, HttpClient client,
        PausedGenerator generator, CancellationTokenSource requestAbort) : IAsyncDisposable
    {
        private const string DisconnectTestHeader = "X-Test-Disconnect";
        private readonly Guid sheetId = Guid.NewGuid();
        public HttpClient Client { get; } = client;
        public PausedGenerator Generator { get; } = generator;
        public string SheetRoute => $"/api/admin/reception-sheets/{sheetId}";
        public string ArchiveRoute => $"{SheetRoute}/pdfs";

        public static async Task<ArchiveFixture> Create()
        {
            var connectionString = $"Data Source={Guid.NewGuid():N};Mode=Memory;Cache=Shared;Pooling=False";
            var db = new SqliteConnection(connectionString);
            await db.OpenAsync();
            var builder = WebApplication.CreateBuilder();
            builder.Configuration["ConnectionStrings:Default"] = connectionString;
            builder.Configuration["MessengerTrial:SheetId"] = "";
            builder.Host.UseAutofac();
            builder.WebHost.UseTestServer();
            builder.Services.AddSingleton(TimeProvider.System);
            var generator = new PausedGenerator();
            builder.Services.AddSingleton<IReceptionSheetPdfGenerator>(generator);
            builder.Services.AddAuthentication("test").AddScheme<AuthenticationSchemeOptions, TestAuthentication>("test", null);
            builder.Services.AddAuthorization();
            builder.Services.AddControllers().AddApplicationPart(typeof(ReceptionSheetsController).Assembly);
            await builder.AddApplicationAsync<ArchiveTestModule>();

            var app = builder.Build();
            await app.InitializeApplicationAsync();
            var requestAbort = new CancellationTokenSource();
            app.Use(async (context, next) =>
            {
                if (context.Request.Headers.ContainsKey(DisconnectTestHeader)) context.RequestAborted = requestAbort.Token;
                await next(context);
            });
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapControllers();
            using (var scope = app.Services.CreateScope())
            using (var unit = scope.ServiceProvider.GetRequiredService<IUnitOfWorkManager>().Begin(requiresNew: true, isTransactional: false))
            {
                var provider = scope.ServiceProvider.GetRequiredService<IDbContextProvider<TeeNovaDbContext>>();
                // Unrelated import entities explicitly use SQL Server's nvarchar(max).
                var schema = (await provider.GetDbContextAsync()).Database.GenerateCreateScript()
                    .Replace("nvarchar(max)", "TEXT", StringComparison.OrdinalIgnoreCase);
                await using var command = db.CreateCommand();
                command.CommandText = schema;
                await command.ExecuteNonQueryAsync();
                await unit.CompleteAsync();
            }
            await app.StartAsync();
            var client = app.GetTestClient();
            client.DefaultRequestHeaders.Add("X-Test-User", TeeNovaRoles.Admin);
            return new(app, db, client, generator, requestAbort);
        }

        public async Task<ReceptionSheetsController.SheetDto> Save(string customer, string? printEstimate, string? version = null)
        {
            var response = await Client.PutAsJsonAsync(SheetRoute, new { customer, printEstimate, version });
            response.EnsureSuccessStatusCode();
            return (await response.Content.ReadFromJsonAsync<ReceptionSheetsController.SheetDto>())!;
        }

        public Task<HttpResponseMessage> Generate(string version) => Client.PostAsJsonAsync(ArchiveRoute, new { version });

        public async Task GenerateWithSimulatedDisconnect(string version)
        {
            using var request = new HttpRequestMessage(HttpMethod.Post, ArchiveRoute)
            {
                Content = JsonContent.Create(new { version }),
            };
            request.Headers.Add(DisconnectTestHeader, "true");
            using var response = await Client.SendAsync(request);
        }

        public void DisconnectRequest() => requestAbort.Cancel();

        public object? ExecuteSql(string sql)
        {
            using var command = database.CreateCommand();
            command.CommandText = sql;
            return command.ExecuteScalar();
        }

        public async ValueTask DisposeAsync()
        {
            Generator.Resume.TrySetResult();
            Client.Dispose();
            await app.DisposeAsync();
            await database.DisposeAsync();
            requestAbort.Dispose();
        }
    }

    [DependsOn(typeof(TeeNovaEntityFrameworkCoreModule), typeof(TeeNovaHttpApiModule), typeof(AbpAutofacModule))]
    public sealed class ArchiveTestModule : AbpModule
    {
        public override void ConfigureServices(ServiceConfigurationContext context) => Configure<AbpDbContextOptions>(options =>
            options.Configure<TeeNovaDbContext>(db => db.DbContextOptions.UseSqlite(db.ConnectionString)));
    }

    private sealed class PausedGenerator : IReceptionSheetPdfGenerator
    {
        private int calls;
        public int Calls => Volatile.Read(ref calls);
        public GeneratedReceptionSheetPdf? Output { get; set; }
        public TaskCompletionSource Started { get; private set; } = new(TaskCreationOptions.RunContinuationsAsynchronously);
        public TaskCompletionSource Resume { get; private set; } = new(TaskCreationOptions.RunContinuationsAsynchronously);

        public void ResetPause()
        {
            Started = new(TaskCreationOptions.RunContinuationsAsynchronously);
            Resume = new(TaskCreationOptions.RunContinuationsAsynchronously);
        }

        public async Task<GeneratedReceptionSheetPdf> GenerateAsync(ReceptionSheetPdfSnapshot snapshot, CancellationToken ct)
        {
            Interlocked.Increment(ref calls);
            Started.TrySetResult();
            await Resume.Task.WaitAsync(ct);
            var snapshotJson = JsonSerializer.Serialize(snapshot, new JsonSerializerOptions
            {
                Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            });
            return Output ?? new(Encoding.UTF8.GetBytes("%PDF-test\n" + snapshotJson), 1);
        }
    }

    private sealed class TestAuthentication(
        IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger, System.Text.Encodings.Web.UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue("X-Test-User", out var role))
                return Task.FromResult(AuthenticateResult.NoResult());

            var identity = new ClaimsIdentity([new(ClaimTypes.Name, "test-user"), new(ClaimTypes.Role, role.ToString())], Scheme.Name);
            return Task.FromResult(AuthenticateResult.Success(new(new ClaimsPrincipal(identity), Scheme.Name)));
        }
    }
}
