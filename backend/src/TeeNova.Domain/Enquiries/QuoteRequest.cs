using System;
using System.Collections.Generic;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Enquiries;

/// <summary>
/// General customer quote request. This aggregate is deliberately independent of Order, pricing,
/// payment, inventory and production. It captures requirements for staff review only.
/// </summary>
public class QuoteRequest : FullAuditedAggregateRoot<Guid>
{
    public string Reference { get; set; } = default!;
    public QuoteServiceType ServiceType { get; set; }
    public string? ServiceTypeOther { get; set; }
    public Guid? ProductId { get; set; }
    public string? ProductNameSnapshot { get; set; }
    public int? Quantity { get; set; }
    public decimal? Width { get; set; }
    public decimal? Height { get; set; }
    public QuoteDimensionUnit? DimensionUnit { get; set; }
    public DateTime? RequiredDate { get; set; }
    public QuoteFulfilmentPreference FulfilmentPreference { get; set; }
    public string? DeliverySuburb { get; set; }
    public string CustomerName { get; set; } = default!;
    public string CustomerEmail { get; set; } = default!;
    public string? CustomerPhone { get; set; }
    public string? OrganisationName { get; set; }
    public string? Notes { get; set; }
    public QuoteRequestStatus Status { get; set; } = QuoteRequestStatus.New;
    public string SubmissionHash { get; set; } = default!;
    public string? SubmissionKey { get; set; }
    public string? SourcePath { get; set; }
    public string? ClientIpHash { get; set; }
    public QuoteNotificationStatus InternalNotificationStatus { get; set; }
    public QuoteNotificationStatus CustomerAcknowledgementStatus { get; set; }
    public ICollection<QuoteRequestAttachment> Attachments { get; set; } = new List<QuoteRequestAttachment>();

    protected QuoteRequest() { }
    public QuoteRequest(Guid id) : base(id) { }

    public void AnonymizeForRetention()
    {
        ServiceTypeOther = null;
        ProductId = null;
        ProductNameSnapshot = null;
        DeliverySuburb = null;
        CustomerName = "Deleted";
        CustomerEmail = "deleted@invalid.local";
        CustomerPhone = null;
        OrganisationName = null;
        Notes = null;
        SubmissionHash = Guid.NewGuid().ToString("N").PadRight(64, '0');
        SubmissionKey = null;
        SourcePath = null;
        ClientIpHash = null;
    }
}
