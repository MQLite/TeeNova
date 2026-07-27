using System;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;

namespace TeeNova.Payments;

/// <summary>
/// Deterministic canonical fingerprint over every customer-relevant value in a Stripe payment quote
/// (Phase 3), used solely for STALE-DISCLOSURE detection: it proves the client is paying against the exact
/// figures and disclosure text it was shown.
///
/// It is NOT an authorisation token and never replaces backend recalculation — the backend always recomputes
/// the quote from trusted commercial pricing and current settings, then compares the client's fingerprint
/// against the freshly computed one.
///
/// Canonicalisation rules (stability matters more than elegance):
/// <list type="bullet">
///   <item>fixed field order, '|' separated, with a version tag first;</item>
///   <item>invariant culture for every number; enums by their invariant name;</item>
///   <item>the disclosure text is included as its own SHA-256 hash, so arbitrary text length/encoding
///         cannot destabilise the canonical form while any edit still changes the fingerprint;</item>
///   <item>SHA-256 over UTF-8, rendered as lower-case hex.</item>
/// </list>
/// No secret material is part of the canonical input.
/// </summary>
public static class StripePaymentQuoteFingerprint
{
    /// <summary>Canonical-form version tag. Bump only if the canonical field list itself changes.</summary>
    public const string CanonicalVersion = "tnq1";

    public static string Compute(
        PaymentProvider     provider,
        PaymentProviderMode providerMode,
        string              currency,
        PaymentPurpose      purpose,
        long                baseAmountCents,
        long                surchargeAmountCents,
        long                chargedAmountCents,
        bool                surchargeEnabled,
        int                 surchargePercentageBasisPoints,
        long                surchargeFixedAmountCents,
        string              calculationVersion,
        string?             disclosureText)
    {
        var canonical = string.Join(
            '|',
            CanonicalVersion,
            provider.ToString(),
            providerMode.ToString(),
            (currency ?? string.Empty).Trim().ToUpperInvariant(),
            purpose.ToString(),
            baseAmountCents.ToString(CultureInfo.InvariantCulture),
            surchargeAmountCents.ToString(CultureInfo.InvariantCulture),
            chargedAmountCents.ToString(CultureInfo.InvariantCulture),
            surchargeEnabled ? "1" : "0",
            surchargePercentageBasisPoints.ToString(CultureInfo.InvariantCulture),
            surchargeFixedAmountCents.ToString(CultureInfo.InvariantCulture),
            (calculationVersion ?? string.Empty).Trim(),
            Sha256Hex(disclosureText ?? string.Empty));

        return Sha256Hex(canonical);
    }

    /// <summary>
    /// Constant-shape comparison of a client-supplied fingerprint against the freshly computed one.
    /// Case-insensitive on hex only; whitespace is trimmed. A null/blank supplied value never matches.
    /// </summary>
    public static bool Matches(string? supplied, string expected)
    {
        if (string.IsNullOrWhiteSpace(supplied) || string.IsNullOrWhiteSpace(expected))
            return false;

        return string.Equals(supplied.Trim(), expected.Trim(), StringComparison.OrdinalIgnoreCase);
    }

    private static string Sha256Hex(string value)
        => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
}
