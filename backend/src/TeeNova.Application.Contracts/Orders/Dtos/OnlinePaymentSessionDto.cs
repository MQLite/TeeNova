using System;
using TeeNova.Payments;

namespace TeeNova.Orders.Dtos;

public class OnlinePaymentSessionDto
{
    public Guid                       Id                  { get; set; }
    public Guid                       OrderId             { get; set; }
    public string                     OrderNumber         { get; set; } = string.Empty;
    public PaymentProvider            Provider            { get; set; }
    public string                     ProviderSessionId   { get; set; } = string.Empty;
    public string                     ProviderCheckoutUrl { get; set; } = string.Empty;
    public decimal                    Amount              { get; set; }
    public string                     Currency            { get; set; } = string.Empty;
    public PaymentPurpose             Purpose             { get; set; }
    public OnlinePaymentSessionStatus Status              { get; set; }
    public DateTime                   CreationTime        { get; set; }
}
