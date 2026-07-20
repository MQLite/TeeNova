using System.Collections.Concurrent;
using System.Diagnostics;
using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using TeeNova.AdminLogs.Dtos;
using TeeNova.Auth;
using Volo.Abp;
using Xunit.Abstractions;

namespace TeeNova.AdminLogs;

public sealed class HostedAdminLogsTests
{
    private readonly ITestOutputHelper _output;

    public HostedAdminLogsTests(ITestOutputHelper output) => _output = output;

    [Fact]
    public async Task Hosted_JWT_authorization_matrix_runs_through_the_real_middleware_pipeline()
    {
        await using var host = await HostedFixture.StartAsync();
        host.CreateFile("matrix.log", "matrix-body");
        var adminToken = host.Token(role: TeeNovaRoles.Admin);
        var fileId = await host.ListedIdAsync(adminToken, "matrix.log");

        await AssertStatusAsync(host, "/api/admin/logs", adminToken, HttpStatusCode.OK);
        await AssertStatusAsync(host, $"/api/admin/logs/{Uri.EscapeDataString(fileId)}/download", adminToken, HttpStatusCode.OK);

        foreach (var role in new[] { TeeNovaRoles.Viewer, "" })
        {
            var token = host.Token(role: role);
            await AssertStatusAsync(host, "/api/admin/logs", token, HttpStatusCode.Forbidden);
            await AssertStatusAsync(host, $"/api/admin/logs/{Uri.EscapeDataString(fileId)}/download", token, HttpStatusCode.Forbidden);
        }

        await AssertStatusAsync(host, "/api/admin/logs", null, HttpStatusCode.Unauthorized);
        await AssertStatusAsync(host, $"/api/admin/logs/{Uri.EscapeDataString(fileId)}/download", null, HttpStatusCode.Unauthorized);

        var invalidTokens = new[]
        {
            host.Token(role: TeeNovaRoles.Admin, expires: DateTimeOffset.UtcNow.AddMinutes(-1)),
            "not.a.jwt",
            host.Token(role: TeeNovaRoles.Admin, secret: HostedFixture.OtherSecret),
            host.Token(role: TeeNovaRoles.Admin, issuer: "invalid-issuer"),
            host.Token(role: TeeNovaRoles.Admin, audience: "invalid-audience"),
        };
        foreach (var token in invalidTokens)
        {
            await AssertStatusAsync(host, "/api/admin/logs", token, HttpStatusCode.Unauthorized);
            await AssertStatusAsync(host, $"/api/admin/logs/{Uri.EscapeDataString(fileId)}/download", token, HttpStatusCode.Unauthorized);
        }
    }

    [Fact]
    public async Task Hosted_listing_is_bounded_safe_and_uses_the_frontend_JSON_contract()
    {
        await using var host = await HostedFixture.StartAsync(maximumListItems: 20);
        host.CreateFile("application.log", "safe");
        host.CreateFile("unicodé-日志.log", "utf8");
        host.CreateFile("ignored.csv", "must-not-list");
        Directory.CreateDirectory(Path.Combine(host.Root, "directory.log"));
        var symlinkCreated = host.TryCreateSymlink("linked.log", "application.log");
        var token = host.Token(TeeNovaRoles.Admin);

        using var response = await host.SendAsync("/api/admin/logs?search=unicod%C3%A9-%E6%97%A5%E5%BF%97", token);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var json = await response.Content.ReadAsStringAsync();
        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        var item = Assert.Single(root.GetProperty("items").EnumerateArray());
        Assert.Equal("unicodé-日志.log", item.GetProperty("fileName").GetString());
        Assert.True(item.TryGetProperty("lastModifiedUtc", out _));
        Assert.True(item.TryGetProperty("sourceKey", out _));
        Assert.False(item.TryGetProperty("FileName", out _));
        Assert.DoesNotContain(host.Root, json, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("ignored.csv", json, StringComparison.Ordinal);
        Assert.DoesNotContain("directory.log", json, StringComparison.Ordinal);
        if (symlinkCreated)
            Assert.DoesNotContain("linked.log", json, StringComparison.Ordinal);
        foreach (var header in response.Headers.Concat(response.Content.Headers))
            Assert.DoesNotContain(host.Root, string.Join(',', header.Value), StringComparison.OrdinalIgnoreCase);

        await AssertStatusAsync(host, "/api/admin/logs?source=unknown", token, HttpStatusCode.NotFound);
        await AssertStatusAsync(host, "/api/admin/logs?page=0", token, HttpStatusCode.BadRequest);
        await AssertStatusAsync(host, "/api/admin/logs?pageSize=999", token, HttpStatusCode.BadRequest);
        await AssertStatusAsync(host, "/api/admin/logs?sortBy=path", token, HttpStatusCode.BadRequest);
        await AssertStatusAsync(host, "/api/admin/logs?sortDirection=sideways", token, HttpStatusCode.BadRequest);

        for (var index = 0; index < 25; index++)
            host.CreateFile($"bounded-{index:D2}.log", "x");
        using (var boundedResponse = await host.SendAsync("/api/admin/logs", token))
        {
            using var boundedJson = JsonDocument.Parse(await boundedResponse.Content.ReadAsStringAsync());
            Assert.True(boundedJson.RootElement.GetProperty("isTruncated").GetBoolean());
            Assert.True(boundedJson.RootElement.GetProperty("items").GetArrayLength() <= 20);
        }

        host.Options.Sources.Insert(0, new AdminLogSourceOptions
        {
            Key = "missing", DisplayName = "Missing", Directory = Path.Combine(host.Root, "absent")
        });
        using var warningResponse = await host.SendAsync("/api/admin/logs", token);
        var warningJson = await warningResponse.Content.ReadAsStringAsync();
        Assert.Equal(HttpStatusCode.OK, warningResponse.StatusCode);
        Assert.Contains("TeeNova:AdminLogs:SourceUnavailable", warningJson, StringComparison.Ordinal);
        Assert.DoesNotContain(Path.Combine(host.Root, "absent"), warningJson, StringComparison.OrdinalIgnoreCase);
        await AssertStatusAsync(host, "/api/admin/logs?source=missing", token, HttpStatusCode.ServiceUnavailable);

        host.Options.Enabled = false;
        await AssertStatusAsync(host, "/api/admin/logs", token, HttpStatusCode.ServiceUnavailable);
    }

    [Fact]
    public async Task Hosted_download_has_safe_headers_fixed_snapshot_and_safe_failure_mappings()
    {
        await using var host = await HostedFixture.StartAsync(maximumDownloadBytes: 64);
        var token = host.Token(TeeNovaRoles.Admin);

        host.CreateFile("unicodé-日志.log", "snapshot");
        var id = await host.ListedIdAsync(token, "unicodé-日志.log");
        File.AppendAllText(host.FilePath("unicodé-日志.log"), "-appended");
        using (var success = await host.SendAsync($"/api/admin/logs/{Uri.EscapeDataString(id)}/download", token))
        {
            Assert.Equal(HttpStatusCode.OK, success.StatusCode);
            Assert.Equal("snapshot", await success.Content.ReadAsStringAsync());
            Assert.Equal("application/octet-stream", success.Content.Headers.ContentType?.MediaType);
            Assert.Equal(8, success.Content.Headers.ContentLength);
            Assert.NotNull(success.Content.Headers.ContentDisposition);
            Assert.Equal("attachment", success.Content.Headers.ContentDisposition!.DispositionType);
            Assert.Contains("UTF-8", success.Content.Headers.ContentDisposition.ToString(), StringComparison.OrdinalIgnoreCase);
            Assert.Equal("no-store", success.Headers.CacheControl?.ToString());
            Assert.Equal("nosniff", Assert.Single(success.Headers.GetValues("X-Content-Type-Options")));
            Assert.Equal("no", Assert.Single(success.Headers.GetValues("X-Accel-Buffering")));
            Assert.False(success.Headers.Contains("Accept-Ranges"));
            Assert.False(success.Headers.Contains("Set-Cookie"));
        }
        Assert.Equal("Success", Assert.Single(host.Audit.Records).Outcome);

        host.Audit.Clear();
        await AssertStatusAsync(host, "/api/admin/logs/not-a-token/download", token, HttpStatusCode.NotFound);
        Assert.Equal("Failed", Assert.Single(host.Audit.Records).Outcome);

        host.Audit.Clear();
        // Tamper a significant interior base64url character. Flipping only the final character is unreliable
        // because its low bits are insignificant padding, so an A<->B change there can decode to the same
        // protected payload; an interior change always alters the ciphertext and fails authenticated decryption.
        var midpoint = id.Length / 2;
        var tampered = id[..midpoint] + (id[midpoint] == 'A' ? 'B' : 'A') + id[(midpoint + 1)..];
        await AssertStatusAsync(host, $"/api/admin/logs/{Uri.EscapeDataString(tampered)}/download", token, HttpStatusCode.NotFound);
        Assert.Equal("Failed", Assert.Single(host.Audit.Records).Outcome);

        host.CreateFile("expired.log", "old");
        var expiredId = await host.ListedIdAsync(token, "expired.log");
        host.Clock.Advance(TimeSpan.FromMinutes(11));
        await AssertStatusAsync(host, $"/api/admin/logs/{Uri.EscapeDataString(expiredId)}/download", token, HttpStatusCode.Gone);
        host.Clock.Advance(TimeSpan.FromMinutes(-11));

        host.CreateFile("deleted.log", "delete");
        var deletedId = await host.ListedIdAsync(token, "deleted.log");
        File.Delete(host.FilePath("deleted.log"));
        await AssertStatusAsync(host, $"/api/admin/logs/{Uri.EscapeDataString(deletedId)}/download", token, HttpStatusCode.NotFound);

        host.CreateFile("renamed.log", "rename");
        var renamedId = await host.ListedIdAsync(token, "renamed.log");
        File.Move(host.FilePath("renamed.log"), host.FilePath("moved.log"));
        await AssertStatusAsync(host, $"/api/admin/logs/{Uri.EscapeDataString(renamedId)}/download", token, HttpStatusCode.NotFound);

        host.CreateFile("replaced.log", "first");
        var replacedId = await host.ListedIdAsync(token, "replaced.log");
        File.Move(host.FilePath("replaced.log"), host.FilePath("old-replaced.log"));
        host.CreateFile("replaced.log", "second");
        await AssertStatusAsync(host, $"/api/admin/logs/{Uri.EscapeDataString(replacedId)}/download", token, HttpStatusCode.Conflict);

        host.CreateFile("truncated.log", "longer-value");
        var truncatedId = await host.ListedIdAsync(token, "truncated.log");
        File.WriteAllText(host.FilePath("truncated.log"), "x");
        await AssertStatusAsync(host, $"/api/admin/logs/{Uri.EscapeDataString(truncatedId)}/download", token, HttpStatusCode.Conflict);

        host.CreateFile("oversized.log", "small");
        var oversizedId = await host.ListedIdAsync(token, "oversized.log");
        File.WriteAllText(host.FilePath("oversized.log"), new string('x', 65));
        await AssertStatusAsync(host, $"/api/admin/logs/{Uri.EscapeDataString(oversizedId)}/download", token, HttpStatusCode.RequestEntityTooLarge);

        host.CreateFile("changed.txt", "text");
        var changedExtensionId = await host.ListedIdAsync(token, "changed.txt");
        host.Options.AllowedExtensions.Remove(".txt");
        await AssertStatusAsync(host, $"/api/admin/logs/{Uri.EscapeDataString(changedExtensionId)}/download", token, HttpStatusCode.NotFound);

        var originalRoot = host.Options.Sources[0].Directory;
        host.Options.Sources[0].Directory = Path.Combine(host.Root, "changed-root");
        await AssertStatusAsync(host, $"/api/admin/logs/{Uri.EscapeDataString(id)}/download", token, HttpStatusCode.NotFound);
        host.Options.Sources[0].Directory = originalRoot;

        host.Options.Enabled = false;
        await AssertStatusAsync(host, $"/api/admin/logs/{Uri.EscapeDataString(id)}/download", token, HttpStatusCode.ServiceUnavailable);

        host.Options.Enabled = true;
        Directory.Delete(host.Root, recursive: true);
        await AssertStatusAsync(host, $"/api/admin/logs/{Uri.EscapeDataString(id)}/download", token, HttpStatusCode.ServiceUnavailable);

        var allAudit = JsonSerializer.Serialize(host.Audit.Records);
        Assert.DoesNotContain(host.Root, allAudit, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain(id, allAudit, StringComparison.Ordinal);
    }

    [Theory]
    [InlineData("../appsettings.json")]
    [InlineData("../../../../etc/passwd")]
    [InlineData("%2e%2e%2f")]
    [InlineData("..%252f")]
    [InlineData("/etc/passwd")]
    [InlineData("C:\\Windows\\System32")]
    [InlineData("C:/Windows/System32")]
    [InlineData("filename.log/../../secret")]
    [InlineData("filename.log%00.txt")]
    [InlineData("file.log\r\nX-Test: injected")]
    [InlineData(".")]
    [InlineData("..")]
    [InlineData("/")]
    [InlineData("\\")]
    [InlineData(":")]
    [InlineData("file:stream")]
    public async Task Hosted_malicious_route_values_never_read_a_file_or_disclose_the_root(string attack)
    {
        await using var host = await HostedFixture.StartAsync();
        host.CreateFile("safe.log", "safe-content");
        var token = host.Token(TeeNovaRoles.Admin);
        var encoded = Uri.EscapeDataString(attack);

        using var response = await host.SendAsync($"/api/admin/logs/{encoded}/download", token);
        var body = await response.Content.ReadAsStringAsync();

        Assert.True((int)response.StatusCode is >= 400 and < 500);
        Assert.DoesNotContain("safe-content", body, StringComparison.Ordinal);
        Assert.DoesNotContain(host.Root, body, StringComparison.OrdinalIgnoreCase);
        Assert.False(response.Headers.Contains("X-Test"));
    }

    [Fact]
    public async Task Hosted_fifty_megabyte_download_is_streamed_and_returns_handle_count_to_baseline()
    {
        const long size = 50L * 1024 * 1024;
        await using var host = await HostedFixture.StartAsync(maximumDownloadBytes: size + 1);
        using (var file = new FileStream(host.FilePath("large.log"), FileMode.CreateNew, FileAccess.Write, FileShare.Read))
            file.SetLength(size);
        var token = host.Token(TeeNovaRoles.Admin);
        var id = await host.ListedIdAsync(token, "large.log");
        var process = Process.GetCurrentProcess();
        process.Refresh();
        var beforeWorkingSet = process.WorkingSet64;
        var beforeHandles = process.HandleCount;
        long peakWorkingSet = beforeWorkingSet;
        long received = 0;

        using (var request = host.Request($"/api/admin/logs/{Uri.EscapeDataString(id)}/download", token))
        using (var response = await host.Client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead))
        await using (var stream = await response.Content.ReadAsStreamAsync())
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            var buffer = new byte[64 * 1024];
            int read;
            while ((read = await stream.ReadAsync(buffer)) != 0)
            {
                received += read;
                process.Refresh();
                peakWorkingSet = Math.Max(peakWorkingSet, process.WorkingSet64);
            }
        }

        GC.Collect();
        GC.WaitForPendingFinalizers();
        process.Refresh();
        var afterHandles = process.HandleCount;
        Assert.Equal(size, received);
        Assert.True(afterHandles <= beforeHandles + 4, $"Handle count grew from {beforeHandles} to {afterHandles}.");
        _output.WriteLine("size_bytes={0}; received_bytes={1}; working_set_before={2}; working_set_peak={3}; observed_delta={4}; handles_before={5}; handles_after={6}",
            size, received, beforeWorkingSet, peakWorkingSet, peakWorkingSet - beforeWorkingSet, beforeHandles, afterHandles);
    }

    [Fact]
    public async Task Hosted_client_cancellation_stops_the_stream_disposes_it_and_emits_one_cancelled_audit()
    {
        const long size = 4L * 1024 * 1024;
        await using var host = await HostedFixture.StartAsync(maximumDownloadBytes: size + 1, throttleReads: true);
        using (var file = new FileStream(host.FilePath("cancel.log"), FileMode.CreateNew, FileAccess.Write, FileShare.Read))
            file.SetLength(size);
        var token = host.Token(TeeNovaRoles.Admin);
        var id = await host.ListedIdAsync(token, "cancel.log");
        host.Audit.Clear();
        using var cancellation = new CancellationTokenSource();
        using var request = host.Request($"/api/admin/logs/{Uri.EscapeDataString(id)}/download", token);
        using var response = await host.Client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellation.Token);
        await using var stream = await response.Content.ReadAsStreamAsync();
        var buffer = new byte[AdminLogDownloadResult.BufferSize];
        Assert.True(await stream.ReadAsync(buffer) > 0);
        cancellation.Cancel();
        response.Dispose();

        var deadline = DateTime.UtcNow.AddSeconds(5);
        while (host.Audit.Records.Count == 0 && DateTime.UtcNow < deadline)
            await Task.Delay(25);

        var audit = Assert.Single(host.Audit.Records);
        Assert.Equal("Cancelled", audit.Outcome);
        Assert.Equal(499, audit.HttpStatus);
        Assert.True(audit.BytesWritten < size);
        Assert.True(host.LastThrottledStream?.Disposed);

        host.Audit.Clear();
        using var subsequent = await host.SendAsync($"/api/admin/logs/{Uri.EscapeDataString(id)}/download", token);
        Assert.Equal(HttpStatusCode.OK, subsequent.StatusCode);
        Assert.Equal(size, (await subsequent.Content.ReadAsByteArrayAsync()).LongLength);
        Assert.Equal("Success", Assert.Single(host.Audit.Records).Outcome);
    }

    private static async Task AssertStatusAsync(
        HostedFixture host, string path, string? token, HttpStatusCode expected)
    {
        using var response = await host.SendAsync(path, token);
        var body = await response.Content.ReadAsStringAsync();
        Assert.True(response.StatusCode == expected,
            $"Expected {(int)expected} but received {(int)response.StatusCode} for {path}. Body: {body}");
        Assert.DoesNotContain(host.Root, body, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("System.", body, StringComparison.Ordinal);
    }

    private sealed class HostedFixture : IAsyncDisposable
    {
        public const string OtherSecret = "other-test-signing-key-32-characters-long";
        private const string Secret = "hosted-test-signing-key-32-characters-long";
        private const string Issuer = "teenova-hosted-tests";
        private const string Audience = "teenova-hosted-client";
        private readonly WebApplication _application;

        private HostedFixture(
            WebApplication application,
            string root,
            AdminLogsOptions options,
            MutableClock clock,
            CapturingAudit audit)
        {
            _application = application;
            Root = root;
            Options = options;
            Clock = clock;
            Audit = audit;
            Client = application.GetTestClient();
        }

        public string Root { get; }
        public HttpClient Client { get; }
        public AdminLogsOptions Options { get; }
        public MutableClock Clock { get; }
        public CapturingAudit Audit { get; }

        public ThrottledReadStream? LastThrottledStream { get; private set; }

        public static async Task<HostedFixture> StartAsync(
            int maximumListItems = 100,
            long maximumDownloadBytes = 1024,
            bool throttleReads = false)
        {
            var root = Path.Combine(Path.GetTempPath(), $"teenova-hosted-{Guid.NewGuid():N}");
            Directory.CreateDirectory(root);
            var options = new AdminLogsOptions
            {
                Enabled = true,
                Sources = [new AdminLogSourceOptions { Key = "api", DisplayName = "API Logs", Directory = root }],
                AllowedExtensions = [".log", ".txt", ".json"],
                MaximumDownloadBytes = maximumDownloadBytes,
                MaximumListItems = maximumListItems,
                DefaultPageSize = Math.Min(50, maximumListItems),
                MaximumPageSize = Math.Min(100, maximumListItems),
                FileIdLifetimeMinutes = 10,
            };
            var clock = new MutableClock(new DateTimeOffset(2026, 7, 20, 3, 0, 0, TimeSpan.Zero));
            var audit = new CapturingAudit();
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions { EnvironmentName = "Production" });
            builder.WebHost.UseTestServer();
            builder.Logging.ClearProviders();
            builder.Services.AddHttpContextAccessor();
            builder.Services.AddSingleton<IOptions<AdminLogsOptions>>(Microsoft.Extensions.Options.Options.Create(options));
            builder.Services.AddSingleton<TimeProvider>(clock);
            builder.Services.AddSingleton<IDataProtectionProvider>(new EphemeralDataProtectionProvider());
            builder.Services.AddSingleton<IAdminLogDirectoryEnumerator, AdminLogDirectoryEnumerator>();
            builder.Services.AddSingleton<IAdminLogFileMetadataReader, AdminLogFileMetadataReader>();
            builder.Services.AddSingleton<IAdminLogFileIdProtector, AdminLogFileIdProtector>();
            HostedFixture? fixture = null;
            builder.Services.AddSingleton<IAdminLogFileOpener>(_ => throttleReads
                ? new ThrottledFileOpener(stream => fixture!.LastThrottledStream = stream)
                : new AdminLogFileOpener());
            builder.Services.AddSingleton<IAdminLogDownloadAudit>(audit);
            builder.Services.AddTransient<IAdminLogAppService, AdminLogAppService>();
            builder.Services.AddTransient<IAdminLogDownloadService, AdminLogDownloadService>();
            builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
                .AddJwtBearer(jwt => jwt.TokenValidationParameters = ValidationParameters(Secret, Issuer, Audience));
            builder.Services.AddAuthorization();
            builder.Services.AddControllers()
                .AddApplicationPart(typeof(AdminLogsController).Assembly)
                .AddJsonOptions(json => json.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase);

            var app = builder.Build();
            app.Use(async (context, next) =>
            {
                try
                {
                    await next();
                }
                catch (BusinessException exception)
                {
                    context.Response.StatusCode = exception.Code switch
                    {
                        AdminLogsErrorCodes.InvalidQuery => 400,
                        AdminLogsErrorCodes.SourceNotFound or AdminLogsErrorCodes.FileUnavailable => 404,
                        AdminLogsErrorCodes.FileIdExpired => 410,
                        AdminLogsErrorCodes.FileChanged => 409,
                        AdminLogsErrorCodes.FileTooLarge => 413,
                        AdminLogsErrorCodes.Disabled or AdminLogsErrorCodes.SourceUnavailable => 503,
                        _ => 500,
                    };
                    await context.Response.WriteAsJsonAsync(new { error = new { code = exception.Code, message = exception.Message } });
                }
            });
            app.UseRouting();
            app.UseAuthentication();
            app.UseAuthorization();
            app.MapControllers();
            await app.StartAsync();
            fixture = new HostedFixture(app, root, options, clock, audit);
            return fixture;
        }

        public string FilePath(string name) => Path.Combine(Root, name);

        public string CreateFile(string name, string content)
        {
            var path = FilePath(name);
            File.WriteAllText(path, content);
            return path;
        }

        public bool TryCreateSymlink(string name, string targetName)
        {
            try
            {
                File.CreateSymbolicLink(FilePath(name), FilePath(targetName));
                return true;
            }
            catch (Exception exception) when (exception is UnauthorizedAccessException or IOException or PlatformNotSupportedException)
            {
                return false;
            }
        }

        public string Token(string role, DateTimeOffset? expires = null, string? secret = null, string? issuer = null, string? audience = null)
        {
            var claims = new List<Claim>
            {
                new(ClaimTypes.NameIdentifier, "admin-test-id"),
                new(ClaimTypes.Name, "hosted-admin"),
            };
            if (!string.IsNullOrEmpty(role)) claims.Add(new Claim(ClaimTypes.Role, role));
            var token = new JwtSecurityToken(
                issuer ?? Issuer,
                audience ?? Audience,
                claims,
                notBefore: DateTimeOffset.UtcNow.AddMinutes(-10).UtcDateTime,
                expires: (expires ?? DateTimeOffset.UtcNow.AddMinutes(5)).UtcDateTime,
                signingCredentials: new SigningCredentials(
                    new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret ?? Secret)),
                    SecurityAlgorithms.HmacSha256));
            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        public HttpRequestMessage Request(string path, string? token)
        {
            var request = new HttpRequestMessage(HttpMethod.Get, path);
            if (token is not null) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
            return request;
        }

        public Task<HttpResponseMessage> SendAsync(string path, string? token)
            => Client.SendAsync(Request(path, token));

        public async Task<string> ListedIdAsync(string token, string fileName)
        {
            using var response = await SendAsync($"/api/admin/logs?search={Uri.EscapeDataString(fileName)}", token);
            response.EnsureSuccessStatusCode();
            var result = await response.Content.ReadFromJsonAsync<AdminLogListResultDto>();
            return Assert.Single(result!.Items).Id;
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await _application.DisposeAsync();
            var target = Root;
            if (Directory.Exists(target) && Path.GetFileName(target).StartsWith("teenova-hosted-", StringComparison.Ordinal))
            {
                try { Directory.Delete(target, recursive: true); }
                catch (Exception exception) when (exception is IOException or UnauthorizedAccessException) { }
            }
        }

        private static TokenValidationParameters ValidationParameters(string secret, string issuer, string audience) => new()
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = issuer,
            ValidAudience = audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)),
            ClockSkew = TimeSpan.Zero,
        };
    }

    private sealed class ThrottledFileOpener : IAdminLogFileOpener
    {
        private readonly AdminLogFileOpener _inner = new();
        private readonly Action<ThrottledReadStream> _capture;
        public ThrottledFileOpener(Action<ThrottledReadStream> capture) => _capture = capture;

        public OpenedFileHandle Open(AdminLogSourceOptions source, AdminLogFileIdPayload claim, long maximumDownloadBytes)
        {
            var opened = _inner.Open(source, claim, maximumDownloadBytes);
            var stream = new ThrottledReadStream(opened.Stream);
            _capture(stream);
            return new OpenedFileHandle(stream, opened.Length, opened.LastModifiedUtc);
        }
    }

    public sealed class ThrottledReadStream : Stream
    {
        private readonly Stream _inner;
        public ThrottledReadStream(Stream inner) => _inner = inner;
        public bool Disposed { get; private set; }
        public override bool CanRead => _inner.CanRead;
        public override bool CanSeek => _inner.CanSeek;
        public override bool CanWrite => false;
        public override long Length => _inner.Length;
        public override long Position { get => _inner.Position; set => _inner.Position = value; }
        public override void Flush() => _inner.Flush();
        public override int Read(byte[] buffer, int offset, int count) => _inner.Read(buffer, offset, count);
        public override long Seek(long offset, SeekOrigin origin) => _inner.Seek(offset, origin);
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default)
        {
            await Task.Delay(20, cancellationToken);
            return await _inner.ReadAsync(buffer, cancellationToken);
        }
        protected override void Dispose(bool disposing)
        {
            if (disposing) _inner.Dispose();
            Disposed = true;
            base.Dispose(disposing);
        }
        public override async ValueTask DisposeAsync()
        {
            await _inner.DisposeAsync();
            Disposed = true;
            GC.SuppressFinalize(this);
        }
    }

    public sealed class MutableClock : TimeProvider
    {
        private DateTimeOffset _now;
        public MutableClock(DateTimeOffset now) => _now = now;
        public override DateTimeOffset GetUtcNow() => _now;
        public void Advance(TimeSpan value) => _now = _now.Add(value);
    }

    public sealed class CapturingAudit : IAdminLogDownloadAudit
    {
        private readonly ConcurrentQueue<AdminLogDownloadAuditRecord> _records = new();
        public IReadOnlyList<AdminLogDownloadAuditRecord> Records => _records.ToArray();
        public void Write(AdminLogDownloadAuditRecord record) => _records.Enqueue(record);
        public void Clear() { while (_records.TryDequeue(out _)) { } }
    }
}
