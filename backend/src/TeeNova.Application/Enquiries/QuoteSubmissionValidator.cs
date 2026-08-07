using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Net.Mail;
using System.Security.Cryptography;
using System.Text;
using TeeNova.Enquiries.Dtos;
using Volo.Abp;
using Volo.Abp.DependencyInjection;

namespace TeeNova.Enquiries;

public sealed class QuoteSubmissionValidator : ITransientDependency
{
    public NormalizedQuoteSubmission ValidateAndNormalize(CreateQuoteRequestDto input, DateTime utcNow)
    {
        ArgumentNullException.ThrowIfNull(input);
        if (!Enum.IsDefined(input.ServiceType) || !Enum.IsDefined(input.FulfilmentPreference))
            Invalid("Select a valid service and fulfilment preference.");
        var name = Required(input.CustomerName, 120, "Enter your name.");
        var email = Required(input.CustomerEmail, 256, "Enter your email address.").ToLowerInvariant();
        try { _ = new MailAddress(email); } catch { Invalid("Enter a valid email address."); }

        var other = Optional(input.ServiceTypeOther, 120);
        if (input.ServiceType == QuoteServiceType.Other && other is null)
            Invalid("Describe the service you need.");
        if (input.Quantity is <= 0 or > 1_000_000)
            Invalid("Quantity must be between 1 and 1,000,000.");

        var requiresDimensions = input.ServiceType is QuoteServiceType.Banners or QuoteServiceType.Signage;
        if (requiresDimensions && (input.Width is null or <= 0 || input.Height is null or <= 0 || input.DimensionUnit is null))
            Invalid("Width, height and a unit are required for banners and signage.");
        if (input.DimensionUnit.HasValue && !Enum.IsDefined(input.DimensionUnit.Value))
            Invalid("Select a valid dimension unit.");
        if (input.RequiredDate?.Date < utcNow.Date)
            Invalid("Required date cannot be in the past.");
        var suburb = Optional(input.DeliverySuburb, 120);
        if (input.FulfilmentPreference == QuoteFulfilmentPreference.Delivery && suburb is null)
            Invalid("Enter the delivery suburb.");

        var source = NormalizeSourcePath(input.SourcePath);
        var key = Optional(input.SubmissionKey, 128);
        if (key is not null && key.Length < 16) Invalid("Submission key is invalid.");

        return new(
            input.ServiceType, other, input.ProductId, input.Quantity,
            input.Width, input.Height, input.DimensionUnit, input.RequiredDate?.Date,
            input.FulfilmentPreference, suburb, name, email, Optional(input.CustomerPhone, 40),
            Optional(input.OrganisationName, 160), Optional(input.Notes, 2000), key, source);
    }

    public static string ComputeSubmissionHash(
        NormalizedQuoteSubmission value,
        IEnumerable<string>? attachmentHashes = null)
    {
        var canonical = string.Join("\n", new[]
        {
            value.CustomerEmail, value.ServiceType.ToString(), value.ServiceTypeOther ?? "",
            value.ProductId?.ToString("N") ?? "", value.Quantity?.ToString(CultureInfo.InvariantCulture) ?? "",
            value.Width?.ToString("0.####", CultureInfo.InvariantCulture) ?? "",
            value.Height?.ToString("0.####", CultureInfo.InvariantCulture) ?? "",
            value.DimensionUnit?.ToString() ?? "", value.RequiredDate?.ToString("yyyy-MM-dd") ?? "",
            value.FulfilmentPreference.ToString(), value.DeliverySuburb?.ToLowerInvariant() ?? "",
            value.Notes?.ToLowerInvariant() ?? "",
            string.Join(",", (attachmentHashes ?? []).OrderBy(x => x, StringComparer.Ordinal)),
        });
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
    }

    public static string? HashClientIp(string? clientIp, string? key)
    {
        if (string.IsNullOrWhiteSpace(clientIp) || string.IsNullOrWhiteSpace(key)) return null;
        return Convert.ToHexString(HMACSHA256.HashData(
            Encoding.UTF8.GetBytes(key), Encoding.UTF8.GetBytes(clientIp.Trim()))).ToLowerInvariant();
    }

    private static string? NormalizeSourcePath(string? value)
    {
        var result = Optional(value, 200);
        if (result is null) return null;
        // Root-relative paths are the only accepted form. Do not use Uri.TryCreate(..., Absolute)
        // here: on Linux it treats values such as "/quote" as absolute file URIs, which rejects
        // the source path sent by every public quote form.
        if (!result.StartsWith("/", StringComparison.Ordinal) ||
            result.StartsWith("//", StringComparison.Ordinal) || result.Contains("\\") ||
            result.Any(char.IsControl))
            Invalid("Source path is invalid.");
        var pathOnly = result.Split('?', '#')[0];
        var allowed = pathOnly == "/" || pathOnly == "/quote" || pathOnly == "/contact" ||
                      pathOnly == "/customize" || pathOnly == "/products" ||
                      pathOnly.StartsWith("/products/", StringComparison.Ordinal) ||
                      pathOnly.StartsWith("/services/", StringComparison.Ordinal);
        if (!allowed) Invalid("Source path is invalid.");
        return result;
    }

    private static string Required(string? value, int max, string message)
        => Optional(value, max) ?? throw new BusinessException(QuoteRequestErrorCodes.InvalidRequest, message);

    private static string? Optional(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var result = value.Trim();
        if (result.Length > max) Invalid("A submitted field is too long.");
        return result;
    }

    private static void Invalid(string message) => throw new BusinessException(QuoteRequestErrorCodes.InvalidRequest, message);
}

public sealed record NormalizedQuoteSubmission(
    QuoteServiceType ServiceType,
    string? ServiceTypeOther,
    Guid? ProductId,
    int? Quantity,
    decimal? Width,
    decimal? Height,
    QuoteDimensionUnit? DimensionUnit,
    DateTime? RequiredDate,
    QuoteFulfilmentPreference FulfilmentPreference,
    string? DeliverySuburb,
    string CustomerName,
    string CustomerEmail,
    string? CustomerPhone,
    string? OrganisationName,
    string? Notes,
    string? SubmissionKey,
    string? SourcePath);
