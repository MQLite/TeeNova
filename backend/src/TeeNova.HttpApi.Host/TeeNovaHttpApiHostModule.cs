using System;
using System.Linq;
using System.Net;
using System.Security.Claims;
using System.Text;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Cors;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using TeeNova.AdminLogs;
using TeeNova.AiOrderImports;
using TeeNova.Auth;
using TeeNova.EntityFrameworkCore;
using Volo.Abp;
using Volo.Abp.AspNetCore.ExceptionHandling;
using Volo.Abp.AspNetCore.Mvc;
using Volo.Abp.AspNetCore.Serilog;
using Volo.Abp.Autofac;
using Volo.Abp.Data;
using Volo.Abp.Modularity;
using Volo.Abp.Swashbuckle;
using Volo.Abp.Timing;

namespace TeeNova;

[DependsOn(
    typeof(TeeNovaHttpApiModule),
    typeof(TeeNovaApplicationModule),
    typeof(TeeNovaEntityFrameworkCoreModule),
    typeof(AbpAutofacModule),
    typeof(AbpAspNetCoreSerilogModule),
    typeof(AbpSwashbuckleModule)
)]
public class TeeNovaHttpApiHostModule : AbpModule
{
    public override void ConfigureServices(ServiceConfigurationContext context)
    {
        var configuration = context.Services.GetConfiguration();
        var hostingEnvironment = context.Services.GetHostingEnvironment();

        ConfigureCors(context, configuration);
        ConfigureSwagger(context);
        ConfigureJwtAuthentication(context, configuration);
        ConfigureForwardedHeaders(context);
        ConfigureRateLimiting(context, configuration);
        ConfigureExceptionHandling(context, hostingEnvironment);

        // Treat all stored/served timestamps as UTC. Without this, ABP's default clock is
        // "Unspecified": Clock.Now returns server-local time with no Kind, and the JSON serializer
        // emits values like "2026-07-13T10:30:00" (no trailing "Z"). A browser then parses that as
        // its own local time, shifting payment/timeline timestamps off the true NZ wall-clock. With
        // Utc, every DateTime is normalized to UTC and serialized with a "Z" so the client can convert
        // it correctly (the admin UI renders it in Pacific/Auckland).
        Configure<AbpClockOptions>(options => options.Kind = DateTimeKind.Utc);

        // Serialize enums as strings so the frontend receives "Pending" not 0
        context.Services.AddControllers()
            .AddJsonOptions(o => o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter()));

        // Security (Task 8703): ABP conventional auto-API exposure is intentionally NOT enabled.
        // Previously `options.ConventionalControllers.Create(typeof(TeeNovaApplicationModule).Assembly)`
        // auto-generated unauthenticated `/api/app/*` routes for every application service, bypassing the
        // authorization carefully applied on the hand-written controllers in TeeNova.HttpApi. Every app
        // service already has a curated manual controller (the only intended HTTP surface), so the
        // auto-API layer is left off to keep admin operations off anonymous routes. If a new public/admin
        // endpoint is needed, add an explicit action to the relevant controller with the right
        // [Authorize]/[AllowAnonymous] attribute rather than re-enabling blanket auto-API.
    }

    private void ConfigureCors(ServiceConfigurationContext context, Microsoft.Extensions.Configuration.IConfiguration configuration)
    {
        // Origins are always an explicit allow-list from config (never a wildcard). Because the policy
        // sends credentials, a "*" origin is both unsafe and rejected by ASP.NET at runtime — filter it
        // out defensively (Jira 9808) so a misconfigured "*" fails closed to "no cross-origin" rather
        // than throwing, and trim entries so stray whitespace never breaks an otherwise-valid origin.
        var corsOrigins = (configuration["App:CorsOrigins"] ?? string.Empty)
            .Split(",", StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Where(o => o != "*")
            .ToArray();

        context.Services.AddCors(options =>
        {
            options.AddDefaultPolicy(builder =>
            {
                builder
                    .WithOrigins(corsOrigins)
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials();
            });
        });
    }

    private void ConfigureSwagger(ServiceConfigurationContext context)
    {
        context.Services.AddAbpSwaggerGen(options =>
        {
            options.SwaggerDoc("v1", new() { Title = "TeeNova API", Version = "v1" });
            options.DocInclusionPredicate((_, _) => true);
            options.CustomSchemaIds(type => type.FullName);

            // Add Bearer token support to Swagger UI so admins can authorize directly in the docs.
            var bearerScheme = new OpenApiSecurityScheme
            {
                Name         = "Authorization",
                Description  = "Enter: Bearer {token}",
                In           = ParameterLocation.Header,
                Type         = SecuritySchemeType.Http,
                Scheme       = "bearer",
                BearerFormat = "JWT",
                Reference    = new OpenApiReference { Type = ReferenceType.SecurityScheme, Id = "Bearer" },
            };
            options.AddSecurityDefinition("Bearer", bearerScheme);
            options.AddSecurityRequirement(new OpenApiSecurityRequirement { { bearerScheme, [] } });
        });
    }

    private void ConfigureJwtAuthentication(ServiceConfigurationContext context, Microsoft.Extensions.Configuration.IConfiguration configuration)
    {
        var jwtSection = configuration.GetSection("Jwt");
        var secret     = jwtSection["Secret"] ?? "";
        var issuer     = jwtSection["Issuer"]   ?? "";
        var audience   = jwtSection["Audience"] ?? "";

        context.Services
            .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
            .AddJwtBearer(options =>
            {
                options.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuer           = true,
                    ValidateAudience         = true,
                    ValidateLifetime         = true,
                    ValidateIssuerSigningKey = true,
                    ValidIssuer              = issuer,
                    ValidAudience            = audience,
                    IssuerSigningKey         = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret)),
                    ClockSkew                = TimeSpan.Zero,
                };
            });
    }

    // Public error-response safety (Jira 9809): outside Development, never send internal exception
    // details or stack traces to API clients. ABP still returns BusinessException codes+messages (the
    // intended, safe validation errors the frontend renders) — only unhandled exceptions (e.g. a raw
    // provider/DB failure on a payment path) collapse to a generic 500, so a stack trace, connection
    // string, or secret can never be echoed to a caller. Explicit here as defense-in-depth over defaults.
    private static void ConfigureExceptionHandling(
        ServiceConfigurationContext context,
        Microsoft.Extensions.Hosting.IHostEnvironment env)
    {
        var isDevelopment = env.IsDevelopment();
        context.Services.Configure<AbpExceptionHandlingOptions>(options =>
        {
            options.SendExceptionsDetailsToClients = isDevelopment;
            options.SendStackTraceToClients        = isDevelopment;
        });

        context.Services.Configure<AbpExceptionHttpStatusCodeOptions>(options =>
        {
            options.Map(AdminLogsErrorCodes.InvalidQuery, HttpStatusCode.BadRequest);
            options.Map(AdminLogsErrorCodes.SourceNotFound, HttpStatusCode.NotFound);
            options.Map(AdminLogsErrorCodes.Disabled, HttpStatusCode.ServiceUnavailable);
            options.Map(AdminLogsErrorCodes.SourceUnavailable, HttpStatusCode.ServiceUnavailable);
            options.Map(AdminLogsErrorCodes.FileUnavailable, HttpStatusCode.NotFound);
            options.Map(AdminLogsErrorCodes.FileIdExpired, HttpStatusCode.Gone);
            options.Map(AdminLogsErrorCodes.FileChanged, HttpStatusCode.Conflict);
            options.Map(AdminLogsErrorCodes.FileTooLarge, HttpStatusCode.RequestEntityTooLarge);
            options.Map(AiOrderImportErrorCodes.InvalidRequest, HttpStatusCode.BadRequest);
            options.Map(AiOrderImportErrorCodes.IdempotencyKeyRequired, HttpStatusCode.BadRequest);
            options.Map(AiOrderImportErrorCodes.ImportNotFound, HttpStatusCode.NotFound);
            options.Map(AiOrderImportErrorCodes.SourceNotFound, HttpStatusCode.NotFound);
            options.Map(AiOrderImportErrorCodes.SourceContentDeleted, HttpStatusCode.NotFound);
            options.Map(AiOrderImportErrorCodes.IdempotencyHashConflict, HttpStatusCode.Conflict);
            options.Map(AiOrderImportErrorCodes.UploadIdempotencyConflict, HttpStatusCode.Conflict);
            options.Map(AiOrderImportErrorCodes.ModificationNotAllowed, HttpStatusCode.Conflict);
            options.Map(AiOrderImportErrorCodes.InvalidDocumentOrder, HttpStatusCode.Conflict);
            options.Map(AiOrderImportErrorCodes.EmptyFile, HttpStatusCode.BadRequest);
            options.Map(AiOrderImportErrorCodes.FileTooLarge, HttpStatusCode.RequestEntityTooLarge);
            options.Map(AiOrderImportErrorCodes.TooManyDocuments, HttpStatusCode.Conflict);
            options.Map(AiOrderImportErrorCodes.TotalBytesExceeded, HttpStatusCode.RequestEntityTooLarge);
            options.Map(AiOrderImportErrorCodes.UnsupportedFileType, HttpStatusCode.UnsupportedMediaType);
            options.Map(AiOrderImportErrorCodes.FileTypeMismatch, HttpStatusCode.UnsupportedMediaType);
            options.Map(AiOrderImportErrorCodes.InvalidSourceContent, HttpStatusCode.UnprocessableEntity);
            options.Map(AiOrderImportErrorCodes.PdfPageLimitExceeded, HttpStatusCode.UnprocessableEntity);
            options.Map(AiOrderImportErrorCodes.ImageDimensionsExceeded, HttpStatusCode.UnprocessableEntity);
            options.Map(AiOrderImportErrorCodes.PrivateStorageFailure, HttpStatusCode.ServiceUnavailable);
            options.Map(AiOrderImportErrorCodes.DatabaseMetadataFailure, HttpStatusCode.ServiceUnavailable);
            options.Map(AiOrderImportErrorCodes.ReviewNotAllowed, HttpStatusCode.Conflict);
            options.Map(AiOrderImportErrorCodes.ReviewRevisionConflict, HttpStatusCode.Conflict);
            options.Map(AiOrderImportErrorCodes.ReviewVersionUnsupported, HttpStatusCode.UnprocessableEntity);
            options.Map(AiOrderImportErrorCodes.ReviewDocumentInvalid, HttpStatusCode.UnprocessableEntity);
            options.Map(AiOrderImportErrorCodes.ReviewReasonRequired, HttpStatusCode.UnprocessableEntity);
            options.Map(AiOrderImportErrorCodes.CatalogueSelectionInvalid, HttpStatusCode.UnprocessableEntity);
            options.Map(AiOrderImportErrorCodes.VariantSelectionInvalid, HttpStatusCode.UnprocessableEntity);
            options.Map(AiOrderImportErrorCodes.ConfirmationNotAllowed, HttpStatusCode.Conflict);
            options.Map(AiOrderImportErrorCodes.ConfirmationNotReady, HttpStatusCode.UnprocessableEntity);
            options.Map(AiOrderImportErrorCodes.ConfirmationOperationConflict, HttpStatusCode.Conflict);
            options.Map(AiOrderImportErrorCodes.MaterializationNotAllowed, HttpStatusCode.Conflict);
            options.Map(AiOrderImportErrorCodes.MaterializationBlocked, HttpStatusCode.UnprocessableEntity);
            options.Map(AiOrderImportErrorCodes.MaterializationOperationConflict, HttpStatusCode.Conflict);
            options.Map(AiOrderImportErrorCodes.MaterializationAlreadyCompleted, HttpStatusCode.Conflict);
            options.Map(AiOrderImportErrorCodes.MaterializationRejected, HttpStatusCode.UnprocessableEntity);
            options.Map(AiOrderImportErrorCodes.FeatureDisabled, HttpStatusCode.ServiceUnavailable);
            options.Map(AiOrderImportErrorCodes.OperationsStatusDisabled, HttpStatusCode.NotFound);
            options.Map(AiOrderImportErrorCodes.RetentionInputInvalid, HttpStatusCode.UnprocessableEntity);
            options.Map(AiOrderImportErrorCodes.RetentionConfirmationRequired, HttpStatusCode.UnprocessableEntity);
            options.Map(AiOrderImportErrorCodes.RetentionHoldActive, HttpStatusCode.Conflict);
            options.Map(AiOrderImportErrorCodes.RetentionNotEligible, HttpStatusCode.Conflict);
            options.Map(AiOrderImportErrorCodes.ImportQuotaExceeded, HttpStatusCode.TooManyRequests);
            options.Map(AiOrderImportErrorCodes.RecognitionConcurrencyExceeded, HttpStatusCode.TooManyRequests);
            options.Map(AiOrderImportErrorCodes.RecognitionProviderDailyQuotaExceeded, HttpStatusCode.TooManyRequests);
            options.Map(AiOrderImportErrorCodes.RecognitionProviderBudgetExceeded, HttpStatusCode.TooManyRequests);
            options.Map(AiOrderImportErrorCodes.RecognitionTotalBudgetExceeded, HttpStatusCode.TooManyRequests);
            options.Map(AiOrderImportErrorCodes.RecognitionImportBudgetExceeded, HttpStatusCode.TooManyRequests);
            options.Map(AiOrderImportErrorCodes.RawEvidenceStorageQuotaExceeded, HttpStatusCode.TooManyRequests);
        });
    }

    private static void ConfigureForwardedHeaders(ServiceConfigurationContext context)
    {
        context.Services.Configure<ForwardedHeadersOptions>(options =>
        {
            options.ForwardedHeaders = ForwardedHeaders.XForwardedFor;
            // Trust the Next.js server on the same machine as a proxy so its
            // forwarded X-Forwarded-For (the real browser IP) is accepted.
            options.KnownProxies.Add(IPAddress.Loopback);      // 127.0.0.1
            options.KnownProxies.Add(IPAddress.IPv6Loopback);  // ::1
        });
    }

    // Public abuse-protection rate limits (Jira 9808). Every policy is per-IP fixed-window and fully
    // config-driven under "PublicRateLimit"; all are registered unconditionally (as NoLimiter when
    // disabled) so the [EnableRateLimiting("…")] attributes always resolve and deploy unchanged.
    private const string AdminLoginPolicy      = "AdminLoginPolicy";
    private const string PublicCheckoutPolicy  = "PublicCheckoutPolicy";
    private const string PublicPricingPolicy   = "PublicPricingPolicy";
    private const string PublicUploadPolicy    = "PublicUploadPolicy";
    private const string PublicEnquiryPolicy   = "PublicEnquiryPolicy";
    private const string PaymentWebhookPolicy  = "PaymentWebhookPolicy";

    private static void ConfigureRateLimiting(
        ServiceConfigurationContext context,
        Microsoft.Extensions.Configuration.IConfiguration configuration)
    {
        var section = configuration.GetSection("AdminAuth:RateLimit");
        var enabled       = section.GetValue<bool>("Enabled", true);
        var permitLimit   = section.GetValue<int>("PermitLimit", 5);
        var windowSeconds = section.GetValue<int>("WindowSeconds", 60);
        var queueLimit    = section.GetValue<int>("QueueLimit", 0);

        // Public endpoint limits (Jira 9808). Defaults are deliberately generous enough for real
        // storefront use yet low enough to blunt anonymous spam / disk-fill / session-spam bursts.
        var publicSection  = configuration.GetSection("PublicRateLimit");
        var publicEnabled  = publicSection.GetValue<bool>("Enabled", true);
        var aiOrderSection = configuration.GetSection("AiOrderIntakeRateLimit");
        var aiOrderEnabled = aiOrderSection.GetValue<bool>("Enabled", true);

        context.Services.AddRateLimiter(options =>
        {
            // Per-IP fixed-window policy from a config subsection, or an inert NoLimiter when disabled
            // (keeps the named policy resolvable so controller attributes never fail to bind).
            void AddPublicPolicy(string name, int defaultPermit, int defaultWindow)
            {
                if (!publicEnabled)
                {
                    options.AddPolicy(name, _ => RateLimitPartition.GetNoLimiter<string>("disabled"));
                    return;
                }

                var sub    = publicSection.GetSection(name);
                var permit = sub.GetValue<int>("PermitLimit", defaultPermit);
                var window = sub.GetValue<int>("WindowSeconds", defaultWindow);
                var queue  = sub.GetValue<int>("QueueLimit", 0);

                options.AddPolicy(name, httpContext =>
                    RateLimitPartition.GetFixedWindowLimiter(
                        partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                        factory: _ => new FixedWindowRateLimiterOptions
                        {
                            PermitLimit       = permit,
                            Window            = TimeSpan.FromSeconds(window),
                            QueueLimit        = queue,
                            AutoReplenishment = true,
                        }));
            }

            void AddAdminPolicy(
                string name,
                string configurationKey,
                int defaultPermit,
                int defaultWindow)
            {
                if (!aiOrderEnabled)
                {
                    options.AddPolicy(name, _ => RateLimitPartition.GetNoLimiter<string>("disabled"));
                    return;
                }

                var sub = aiOrderSection.GetSection(configurationKey);
                var permit = sub.GetValue<int>("PermitLimit", defaultPermit);
                var window = sub.GetValue<int>("WindowSeconds", defaultWindow);
                var queue = sub.GetValue<int>("QueueLimit", 0);
                options.AddPolicy(name, httpContext =>
                {
                    var actor = httpContext.User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
                    var partition = !string.IsNullOrWhiteSpace(actor)
                        ? $"admin:{actor}"
                        : $"ip:{httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown"}";
                    return RateLimitPartition.GetFixedWindowLimiter(
                        partition,
                        _ => new FixedWindowRateLimiterOptions
                        {
                            PermitLimit = permit,
                            Window = TimeSpan.FromSeconds(window),
                            QueueLimit = queue,
                            AutoReplenishment = true,
                        });
                });
            }

            if (enabled)
            {
                options.AddPolicy(AdminLoginPolicy, httpContext =>
                    RateLimitPartition.GetFixedWindowLimiter(
                        partitionKey: httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
                        factory: _ => new FixedWindowRateLimiterOptions
                        {
                            PermitLimit      = permitLimit,
                            Window           = TimeSpan.FromSeconds(windowSeconds),
                            QueueLimit       = queueLimit,
                            AutoReplenishment = true,
                        }));
            }
            else
            {
                // Emergency disable path: register the policy name with no limiting so
                // [EnableRateLimiting("AdminLoginPolicy")] compiles and deploys unchanged.
                options.AddPolicy(AdminLoginPolicy, _ =>
                    RateLimitPartition.GetNoLimiter<string>("disabled"));
            }

            // Checkout writes (order create, online payment session): anonymous + can trigger emails /
            // DB writes / provider session creation, so the tightest of the public limits.
            AddPublicPolicy(PublicCheckoutPolicy, defaultPermit: 10, defaultWindow: 60);

            // Pricing quote: read-only, no writes, called repeatedly while customizing — most generous.
            AddPublicPolicy(PublicPricingPolicy, defaultPermit: 60, defaultWindow: 60);

            // File upload: anonymous + writes files to disk — capped to blunt disk-fill abuse.
            AddPublicPolicy(PublicUploadPolicy, defaultPermit: 20, defaultWindow: 60);

            // Banner enquiry: anonymous + triggers admin/customer emails — kept low like checkout.
            AddPublicPolicy(PublicEnquiryPolicy, defaultPermit: 8, defaultWindow: 60);

            // Payment webhook: server-to-server. Deliberately VERY generous so a legitimate Stripe retry
            // burst is never throttled; this exists only to cap a pathological flood, not normal delivery.
            // Signature verification + the 1 MB body cap (Jira 9805) remain the real webhook guards.
            AddPublicPolicy(PaymentWebhookPolicy, defaultPermit: 300, defaultWindow: 60);
            AddAdminPolicy(
                AiOrderImportRateLimitPolicies.Create,
                "Create",
                defaultPermit: 20,
                defaultWindow: 60);
            AddAdminPolicy(
                AiOrderImportRateLimitPolicies.Upload,
                "Upload",
                defaultPermit: 30,
                defaultWindow: 60);
            AddAdminPolicy(
                AiOrderImportRateLimitPolicies.Content,
                "Content",
                defaultPermit: 120,
                defaultWindow: 60);

            options.OnRejected = async (ctx, ct) =>
            {
                ctx.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
                var retryAfter = ctx.Lease.TryGetMetadata(
                    MetadataName.RetryAfter,
                    out var leaseRetryAfter)
                    ? Math.Max(1, (int)Math.Ceiling(leaseRetryAfter.TotalSeconds))
                    : windowSeconds;
                ctx.HttpContext.Response.Headers["Retry-After"] = retryAfter.ToString();
                await ctx.HttpContext.Response.WriteAsJsonAsync(
                    new { message = "Too many requests. Please wait a moment and try again." },
                    ct);

                ctx.HttpContext.RequestServices
                    .GetRequiredService<ILogger<TeeNovaHttpApiHostModule>>()
                    .LogWarning(
                        "Rate limit exceeded for {Path}.",
                        ctx.HttpContext.Request.Path);
            };
        });
    }

    public override void OnApplicationInitialization(ApplicationInitializationContext context)
    {
        var app = context.GetApplicationBuilder();
        var env = context.GetEnvironment();

        if (env.IsDevelopment())
        {
            app.UseDeveloperExceptionPage();
        }

        app.UseForwardedHeaders();
        app.UseAbpRequestLocalization();
        app.UseStaticFiles();
        app.UseRouting();
        app.UseCors();
        app.UseAuthentication();
        app.UseRateLimiter();
        app.UseAuthorization();
        app.UseSwagger();
        app.UseAbpSwaggerUI(options =>
        {
            options.SwaggerEndpoint("/swagger/v1/swagger.json", "TeeNova API v1");
        });
        app.UseAuditing();
        app.UseAbpSerilogEnrichers();
        app.UseConfiguredEndpoints();
    }

    public override async Task OnPostApplicationInitializationAsync(ApplicationInitializationContext context)
    {
        // Seed demo data on startup — the contributor checks if data already exists
        using var scope = context.ServiceProvider.CreateScope();
        await scope.ServiceProvider
            .GetRequiredService<IDataSeeder>()
            .SeedAsync(new DataSeedContext());
    }
}
