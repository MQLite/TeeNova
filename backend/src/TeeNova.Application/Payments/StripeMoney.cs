using System;
using Volo.Abp;

namespace TeeNova.Payments;

/// <summary>
/// The single decimal ↔ minor-unit (cents) boundary for Stripe payment amounts (Phase 3).
///
/// The authoritative surcharge calculator works exclusively in integer cents, while orders, settings and
/// payment sessions store <see cref="decimal"/> dollars. Every crossing goes through here so the conversion
/// rule is stated once and always fails closed: a value that is not EXACTLY cent-aligned, is negative where
/// not allowed, overflows, or is expressed in an unsupported currency is rejected rather than rounded.
///
/// Binary floating point (<c>double</c>/<c>float</c>) is never used; <see cref="decimal"/> multiplication and
/// division by 100 are exact for cent-aligned money, so no rounding mode is required in either direction.
/// </summary>
public static class StripeMoney
{
    /// <summary>The only currency supported by surcharge calculation version <c>stripe-gross-up-v1</c>.</summary>
    public const string SupportedCurrency = "NZD";

    private const decimal CentsPerUnit = 100m;

    /// <summary>
    /// Upper bound for any single converted amount (NZ$10,000,000.00). Well above any real order while
    /// keeping the grossed-up calculator's intermediate <c>cents × 10,000</c> product far inside Int64.
    /// </summary>
    public const long MaxAmountCents = 1_000_000_000L;

    public static bool IsSupportedCurrency(string? currency)
        => string.Equals(currency?.Trim(), SupportedCurrency, StringComparison.OrdinalIgnoreCase);

    /// <summary>Fails closed when the currency is anything other than NZD.</summary>
    public static void EnsureSupportedCurrency(string? currency, string context)
    {
        if (IsSupportedCurrency(currency))
            return;

        throw new BusinessException("TeeNova:Payment:StripeCurrencyUnsupported")
            .WithData("Context", context)
            .WithData("Currency", string.IsNullOrWhiteSpace(currency) ? "(none)" : currency.Trim())
            .WithData("SupportedCurrency", SupportedCurrency);
    }

    public static bool IsCentAligned(decimal amount)
        => amount == decimal.Round(amount, 2, MidpointRounding.ToEven);

    /// <summary>
    /// Converts exactly cent-aligned dollars to integer cents. Rejects fractional cents, negatives and
    /// out-of-range values with a safe business error naming only the field, never the caller's context.
    /// </summary>
    public static long ToCents(decimal amount, string field)
    {
        if (!IsCentAligned(amount))
            throw new BusinessException("TeeNova:Payment:StripeAmountPrecisionInvalid")
                .WithData("Field", field)
                .WithData("Amount", amount);

        if (amount < 0m)
            throw new BusinessException("TeeNova:Payment:StripeAmountNegative")
                .WithData("Field", field)
                .WithData("Amount", amount);

        long cents;
        try
        {
            checked
            {
                // Exact for cent-aligned decimals: 3.04m * 100m == 304.00m, which truncates to 304 with no loss.
                cents = (long)(amount * CentsPerUnit);
            }
        }
        catch (OverflowException)
        {
            throw new BusinessException("TeeNova:Payment:StripeAmountOutOfRange")
                .WithData("Field", field)
                .WithData("Amount", amount);
        }

        if (cents > MaxAmountCents)
            throw new BusinessException("TeeNova:Payment:StripeAmountOutOfRange")
                .WithData("Field", field)
                .WithData("Amount", amount);

        return cents;
    }

    /// <summary>Converts integer cents back to exact decimal dollars (division by 100 is exact for decimal).</summary>
    public static decimal FromCents(long cents)
    {
        if (cents < 0)
            throw new BusinessException("TeeNova:Payment:StripeAmountNegative")
                .WithData("Field", "cents")
                .WithData("Amount", cents);

        return cents / CentsPerUnit;
    }
}
