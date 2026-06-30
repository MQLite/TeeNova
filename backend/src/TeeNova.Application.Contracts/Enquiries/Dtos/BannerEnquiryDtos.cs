using System;
using System.ComponentModel.DataAnnotations;
using TeeNova.Orders;
using TeeNova.Orders.Dtos;
using Volo.Abp.Application.Dtos;

namespace TeeNova.Enquiries.Dtos;

/// <summary>
/// Customer Banner quote enquiry submission (Jira 9512). Enquiry-first: carries NO price fields, NO
/// variant, and NO prints. The server validates the product is Banner + CustomQuoteOnly and normalizes
/// the Banner detail (computing area). Reuses <see cref="BannerDetailInputDto"/> from 9511.
/// </summary>
public class CreateBannerEnquiryDto
{
    [Required]
    public Guid ProductId { get; set; }

    [Range(1, 100000)]
    public int Quantity { get; set; } = 1;

    [Required, MaxLength(256)]
    public string CustomerName { get; set; } = default!;

    [Required, EmailAddress, MaxLength(256)]
    public string CustomerEmail { get; set; } = default!;

    [MaxLength(32)]
    public string? CustomerPhone { get; set; }

    [MaxLength(2000)]
    public string? Message { get; set; }

    // ── Item-level design ─────────────────────────────────────────────────────────
    public Guid?   UploadedAssetId  { get; set; }
    [MaxLength(2048)]
    public string? UploadedAssetUrl { get; set; }
    [MaxLength(2000)]
    public string? DesignNote       { get; set; }

    [Required]
    public BannerDetailInputDto BannerDetail { get; set; } = default!;
}

/// <summary>Result of submitting a Banner enquiry (Jira 9512). No payment URL, no order, no price.</summary>
public class BannerEnquiryResultDto
{
    public Guid   Id          { get; set; }
    public BannerQuoteRequestStatus Status { get; set; }
    public Guid   ProductId   { get; set; }
    public string ProductName { get; set; } = default!;
    public int    Quantity    { get; set; }
    public decimal? AreaSquareMetres { get; set; }

    /// <summary>Customer-facing confirmation copy.</summary>
    public string Message { get; set; } = default!;
}

/// <summary>Full Banner quote enquiry for the admin review surface (Jira 9512).</summary>
public class BannerQuoteRequestDto
{
    public Guid   Id                  { get; set; }
    public Guid   ProductId           { get; set; }
    public string ProductNameSnapshot { get; set; } = default!;
    public int    Quantity            { get; set; }

    public string  CustomerName  { get; set; } = default!;
    public string  CustomerEmail { get; set; } = default!;
    public string? CustomerPhone { get; set; }
    public string? Message       { get; set; }

    public Guid?   UploadedAssetId  { get; set; }
    public string? UploadedAssetUrl { get; set; }
    public string? DesignNote       { get; set; }

    public BannerSizeMode       SizeMode            { get; set; }
    public Guid?                SizePresetId        { get; set; }
    public string?              SizeLabel           { get; set; }
    public decimal?             Width               { get; set; }
    public decimal?             Height              { get; set; }
    public BannerDimensionUnit? Unit                { get; set; }
    public decimal?             AreaSquareMetres    { get; set; }
    public BannerMaterial       Material            { get; set; }
    public string?              MaterialDisplayName { get; set; }

    public bool    FinishingEyelets     { get; set; }
    public bool    FinishingHemming     { get; set; }
    public bool    FinishingPolePocket  { get; set; }
    public string? FinishingOther       { get; set; }
    public bool    StandIncluded        { get; set; }
    public bool    StandReplacementOnly { get; set; }
    public string? BannerNotes          { get; set; }

    public BannerQuoteRequestStatus Status { get; set; }
    public Guid?    ConvertedOrderId { get; set; }
    public DateTime CreationTime     { get; set; }
}

/// <summary>Paged/filtered query for the admin enquiry list (Jira 9512).</summary>
public class GetBannerQuoteRequestsInput : PagedResultRequestDto
{
    public BannerQuoteRequestStatus? Status { get; set; }
}

/// <summary>
/// Admin conversion of a Banner enquiry into an unpaid priced order (Jira 9513). The admin-entered
/// <see cref="QuotedTotal"/> is the ONLY price source — the customer never supplies a price. No payment
/// is taken and no payment session is created by conversion.
/// </summary>
public class ConvertBannerQuoteRequestDto
{
    /// <summary>Admin-quoted order total (NZD). Must be &gt; 0 — conversion never creates a $0 order.</summary>
    [Range(0.01, 100000000)]
    public decimal QuotedTotal { get; set; }

    /// <summary>Optional internal note stored on the order's admin notes.</summary>
    [MaxLength(2000)]
    public string? AdminNote { get; set; }

    /// <summary>Optional customer-facing note stored on the order's notes.</summary>
    [MaxLength(2000)]
    public string? CustomerNote { get; set; }

    /// <summary>Optional delivery method for the created order. Null = full payment required (default).</summary>
    public DeliveryMethod? DeliveryMethod { get; set; }
}

/// <summary>Result of converting a Banner enquiry to an order (Jira 9513). No payment URL.</summary>
public class ConvertBannerQuoteRequestResultDto
{
    public Guid   QuoteRequestId { get; set; }
    public BannerQuoteRequestStatus Status { get; set; }
    public Guid   OrderId        { get; set; }
    public string OrderNumber    { get; set; } = default!;
    public decimal OrderTotal    { get; set; }
}
