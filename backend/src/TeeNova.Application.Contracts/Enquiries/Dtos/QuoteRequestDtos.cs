using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.IO;
using Microsoft.AspNetCore.Http;
using Volo.Abp.Application.Dtos;

namespace TeeNova.Enquiries.Dtos;

public sealed class StageQuoteAttachmentResultDto
{
    public string AttachmentToken { get; set; } = default!;
    public string FileName { get; set; } = default!;
    public string ContentType { get; set; } = default!;
    public long SizeBytes { get; set; }
}

public sealed class CreateQuoteRequestDto
{
    public QuoteServiceType ServiceType { get; set; }
    [MaxLength(120)] public string? ServiceTypeOther { get; set; }
    public Guid? ProductId { get; set; }
    [Range(1, 1000000)] public int? Quantity { get; set; }
    [Range(typeof(decimal), "0.0001", "1000000")] public decimal? Width { get; set; }
    [Range(typeof(decimal), "0.0001", "1000000")] public decimal? Height { get; set; }
    public QuoteDimensionUnit? DimensionUnit { get; set; }
    public DateTime? RequiredDate { get; set; }
    public QuoteFulfilmentPreference FulfilmentPreference { get; set; }
    [MaxLength(120)] public string? DeliverySuburb { get; set; }
    [Required, MaxLength(120)] public string CustomerName { get; set; } = default!;
    [Required, EmailAddress, MaxLength(256)] public string CustomerEmail { get; set; } = default!;
    [MaxLength(40)] public string? CustomerPhone { get; set; }
    [MaxLength(160)] public string? OrganisationName { get; set; }
    [MaxLength(2000)] public string? Notes { get; set; }
    [MaxLength(128)] public string? SubmissionKey { get; set; }
    [MaxLength(200)] public string? SourcePath { get; set; }
    public IReadOnlyList<string> AttachmentTokens { get; set; } = [];
    [MaxLength(200)] public string? Website { get; set; }
    public DateTime? FormStartedAtUtc { get; set; }
}

public sealed class QuoteRequestResultDto
{
    public Guid Id { get; set; }
    public string Reference { get; set; } = default!;
    public QuoteRequestStatus Status { get; set; }
    public bool WasDuplicate { get; set; }
    public string Message { get; set; } = default!;
}

public sealed class QuoteRequestAttachmentDto
{
    public Guid Id { get; set; }
    public string FileName { get; set; } = default!;
    public string ContentType { get; set; } = default!;
    public long SizeBytes { get; set; }
    public string Sha256 { get; set; } = default!;
    public QuoteAttachmentScanStatus ScanStatus { get; set; }
}

public sealed class QuoteRequestDto
{
    public Guid Id { get; set; }
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
    public QuoteRequestStatus Status { get; set; }
    public QuoteNotificationStatus InternalNotificationStatus { get; set; }
    public QuoteNotificationStatus CustomerAcknowledgementStatus { get; set; }
    public string? SourcePath { get; set; }
    public DateTime CreationTime { get; set; }
    public IReadOnlyList<QuoteRequestAttachmentDto> Attachments { get; set; } = [];
    public int AttachmentCount { get; set; }
}

public sealed class QuoteRequestSummaryDto
{
    public Guid Id { get; set; }
    public string Reference { get; set; } = default!;
    public QuoteServiceType ServiceType { get; set; }
    public string CustomerName { get; set; } = default!;
    public string CustomerEmail { get; set; } = default!;
    public int? Quantity { get; set; }
    public DateTime? RequiredDate { get; set; }
    public int AttachmentCount { get; set; }
    public QuoteRequestStatus Status { get; set; }
    public QuoteNotificationStatus InternalNotificationStatus { get; set; }
    public QuoteNotificationStatus CustomerAcknowledgementStatus { get; set; }
    public DateTime CreationTime { get; set; }
}

public sealed class GetQuoteRequestsInput : PagedResultRequestDto
{
    public QuoteRequestStatus? Status { get; set; }
    public QuoteServiceType? ServiceType { get; set; }
}

public sealed class ResendQuoteNotificationDto
{
    [Required] public string Channel { get; set; } = default!;
}

public sealed record OpenedQuoteAttachment(Stream Stream, string ContentType, string SafeFileName);
