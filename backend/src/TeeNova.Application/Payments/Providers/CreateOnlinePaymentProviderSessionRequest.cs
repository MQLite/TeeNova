using System;
using System.Collections.Generic;

namespace TeeNova.Payments;

/// <summary>
/// Provider-neutral request passed to IOnlinePaymentProvider.CreatePaymentSessionAsync.
/// Contains all information needed to create a hosted checkout session regardless of provider.
/// </summary>
public class CreateOnlinePaymentProviderSessionRequest
{
    public Guid   OrderId       { get; set; }
    public string OrderNumber   { get; set; } = string.Empty;
    public PaymentProvider Provider { get; set; }
    public PaymentPurpose  Purpose  { get; set; }
    public decimal Amount          { get; set; }
    public string  Currency        { get; set; } = "NZD";
    public string  CustomerEmail   { get; set; } = string.Empty;
    public string  SuccessUrl      { get; set; } = string.Empty;
    public string  CancelUrl       { get; set; } = string.Empty;

    /// <summary>
    /// Arbitrary key-value metadata forwarded to the provider (e.g. order id, purpose).
    /// Provider implementations decide which fields to attach as provider-side metadata.
    /// </summary>
    public Dictionary<string, string> Metadata { get; set; } = new();
}
