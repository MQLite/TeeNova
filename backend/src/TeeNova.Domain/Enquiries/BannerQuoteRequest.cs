using System;
using TeeNova.Orders;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Enquiries;

/// <summary>
/// A customer Banner quote enquiry (Jira 9512). Banner is <c>CustomQuoteOnly</c> / enquiry-first: the
/// customer submits requirements + design and we quote manually. This is deliberately a SEPARATE
/// aggregate from <c>Order</c> — it never has a price, a payment, or a production state, so it can never
/// be mistaken for a paid $0 order (the 9511 checkout guard stays authoritative).
///
/// The Banner configuration is stored in structured columns (reusing the 9511 Banner enums), never JSON.
/// <see cref="AreaSquareMetres"/> is computed server-side by <c>BannerDetailValidator</c>.
/// </summary>
public class BannerQuoteRequest : FullAuditedAggregateRoot<Guid>
{
    // ── Product snapshot ─────────────────────────────────────────────────────────
    public Guid   ProductId           { get; set; }
    public string ProductNameSnapshot { get; set; } = default!;
    public int    Quantity            { get; set; }

    // ── Customer contact ─────────────────────────────────────────────────────────
    public string  CustomerName  { get; set; } = default!;
    public string  CustomerEmail { get; set; } = default!;
    public string? CustomerPhone { get; set; }
    public string? Message       { get; set; }

    // ── Item-level design (reuses the upload asset model) ─────────────────────────
    public Guid?   UploadedAssetId  { get; set; }
    public string? UploadedAssetUrl { get; set; }
    public string? DesignNote       { get; set; }

    // ── Banner configuration (structured; reuses 9511 enums) ──────────────────────
    public BannerSizeMode       SizeMode         { get; set; }
    public Guid?                SizePresetId     { get; set; }
    public string?              SizeLabel        { get; set; }
    public decimal?             Width            { get; set; }
    public decimal?             Height           { get; set; }
    public BannerDimensionUnit? Unit             { get; set; }
    public decimal?             AreaSquareMetres { get; set; }
    public BannerMaterial       Material         { get; set; }
    public string?              MaterialDisplayName { get; set; }

    public bool    FinishingEyelets     { get; set; }
    public bool    FinishingHemming     { get; set; }
    public bool    FinishingPolePocket  { get; set; }
    public string? FinishingOther       { get; set; }
    public bool    StandIncluded        { get; set; }
    public bool    StandReplacementOnly { get; set; }
    public string? BannerNotes          { get; set; }

    // ── Workflow ──────────────────────────────────────────────────────────────────
    public BannerQuoteRequestStatus Status { get; set; } = BannerQuoteRequestStatus.New;

    /// <summary>Set if/when an admin converts this enquiry into a real priced order (future flow).</summary>
    public Guid? ConvertedOrderId { get; set; }

    protected BannerQuoteRequest() { }

    public BannerQuoteRequest(Guid id) : base(id) { }
}
