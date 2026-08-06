using System;
using Volo.Abp.Domain.Entities.Auditing;

namespace TeeNova.Enquiries;

public class QuoteRequestAttachment : CreationAuditedEntity<Guid>
{
    public Guid? QuoteRequestId { get; set; }
    public string ObjectKey { get; set; } = default!;
    public string OriginalFileName { get; set; } = default!;
    public string ContentType { get; set; } = default!;
    public long SizeBytes { get; set; }
    public string Sha256 { get; set; } = default!;
    public string UploadTokenHash { get; set; } = default!;
    public DateTime? StagedUntil { get; set; }
    public QuoteAttachmentScanStatus ScanStatus { get; set; } = QuoteAttachmentScanStatus.NotScanned;
    public QuoteRequest? QuoteRequest { get; set; }

    protected QuoteRequestAttachment() { }
    public QuoteRequestAttachment(Guid id) : base(id) { }
}
