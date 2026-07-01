using System;
using System.Net;
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
using TeeNova.Auth;
using TeeNova.EntityFrameworkCore;
using Volo.Abp;
using Volo.Abp.AspNetCore.Mvc;
using Volo.Abp.AspNetCore.Serilog;
using Volo.Abp.Autofac;
using Volo.Abp.Data;
using Volo.Abp.Modularity;
using Volo.Abp.Swashbuckle;

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
        context.Services.AddCors(options =>
        {
            options.AddDefaultPolicy(builder =>
            {
                builder
                    .WithOrigins(configuration["App:CorsOrigins"]?
                        .Split(",", StringSplitOptions.RemoveEmptyEntries) ?? Array.Empty<string>())
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

    private static void ConfigureRateLimiting(
        ServiceConfigurationContext context,
        Microsoft.Extensions.Configuration.IConfiguration configuration)
    {
        var section = configuration.GetSection("AdminAuth:RateLimit");
        var enabled       = section.GetValue<bool>("Enabled", true);
        var permitLimit   = section.GetValue<int>("PermitLimit", 5);
        var windowSeconds = section.GetValue<int>("WindowSeconds", 60);
        var queueLimit    = section.GetValue<int>("QueueLimit", 0);

        context.Services.AddRateLimiter(options =>
        {
            if (enabled)
            {
                options.AddPolicy("AdminLoginPolicy", httpContext =>
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
                options.AddPolicy("AdminLoginPolicy", _ =>
                    RateLimitPartition.GetNoLimiter<string>("disabled"));
            }

            options.OnRejected = async (ctx, ct) =>
            {
                ctx.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
                ctx.HttpContext.Response.Headers["Retry-After"] = windowSeconds.ToString();
                await ctx.HttpContext.Response.WriteAsJsonAsync(
                    new { message = "Too many login attempts. Please wait before trying again." },
                    ct);

                ctx.HttpContext.RequestServices
                    .GetRequiredService<ILogger<TeeNovaHttpApiHostModule>>()
                    .LogWarning(
                        "Admin login rate limit exceeded from IP {RemoteIp}.",
                        ctx.HttpContext.Connection.RemoteIpAddress);
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
        app.UseRateLimiter();
        app.UseCors();
        app.UseAuthentication();
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
