using System;
using System.Collections.Generic;
using System.Data;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Logging;
using TeeNova.Catalog;
using TeeNova.Email;
using TeeNova.Enquiries.Dtos;
using TeeNova.Enquiries.PrivateStorage;
using Volo.Abp;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Entities;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Uow;

namespace TeeNova.Enquiries;

public class QuoteRequestAppService : ApplicationService, IQuoteRequestAppService
{
    private readonly IRepository<QuoteRequest, Guid> _quotes;
    private readonly IRepository<QuoteRequestAttachment, Guid> _attachments;
    private readonly IRepository<Product, Guid> _products;
    private readonly IQuoteAttachmentService _attachmentService;
    private readonly IQuotePrivateObjectStorage _storage;
    private readonly QuoteSubmissionValidator _validator;
    private readonly IQuoteReferenceGenerator _references;
    private readonly IQuoteRequestEmailService _email;
    private readonly QuoteRequestOptions _options;

    public QuoteRequestAppService(
        IRepository<QuoteRequest, Guid> quotes,
        IRepository<QuoteRequestAttachment, Guid> attachments,
        IRepository<Product, Guid> products,
        IQuoteAttachmentService attachmentService,
        IQuotePrivateObjectStorage storage,
        QuoteSubmissionValidator validator,
        IQuoteReferenceGenerator references,
        IQuoteRequestEmailService email,
        IOptions<QuoteRequestOptions> options)
    {
        _quotes = quotes;
        _attachments = attachments;
        _products = products;
        _attachmentService = attachmentService;
        _storage = storage;
        _validator = validator;
        _references = references;
        _email = email;
        _options = options.Value;
    }

    public Task<StageQuoteAttachmentResultDto> StageAttachmentAsync(IFormFile file, CancellationToken cancellationToken = default)
        => _attachmentService.StageAsync(file, cancellationToken);

    [UnitOfWork(IsDisabled = true)]
    public virtual async Task<QuoteRequestResultDto> CreateAsync(
        CreateQuoteRequestDto input, string? clientIp, CancellationToken cancellationToken = default)
    {
        RequireOperational();
        if (!string.IsNullOrWhiteSpace(input.Website))
            throw new BusinessException(QuoteRequestErrorCodes.SpamRejected, "The quote request could not be submitted.");
        var now = Clock.Now;
        if (!input.FormStartedAtUtc.HasValue ||
            now - input.FormStartedAtUtc.Value.ToUniversalTime() < TimeSpan.FromSeconds(Math.Max(0, _options.MinimumSubmitSeconds)))
            throw new BusinessException(QuoteRequestErrorCodes.SpamRejected, "The quote request could not be submitted.");

        var normalized = _validator.ValidateAndNormalize(input, now);
        using var persistenceUnitOfWork = UnitOfWorkManager.Begin(
            new AbpUnitOfWorkOptions { IsTransactional = true, IsolationLevel = IsolationLevel.Serializable },
            requiresNew: true);
        QuoteRequest? keyed = null;
        if (normalized.SubmissionKey is not null)
        {
            keyed = await _quotes.FindAsync(x => x.SubmissionKey == normalized.SubmissionKey, cancellationToken: cancellationToken);
        }

        var claimed = await ResolveAttachmentsAsync(input.AttachmentTokens, now, keyed?.Id, cancellationToken);
        var hash = QuoteSubmissionValidator.ComputeSubmissionHash(normalized, claimed.Select(x => x.Sha256));
        if (keyed is not null)
        {
            if (!string.Equals(keyed.SubmissionHash, hash, StringComparison.Ordinal))
                throw new BusinessException(QuoteRequestErrorCodes.IdempotencyConflict,
                    "This submission key was already used for different quote details.");
            await persistenceUnitOfWork.CompleteAsync(cancellationToken);
            return Result(keyed, duplicate: true);
        }

        var duplicateCutoff = now.AddMinutes(-Math.Max(0, _options.DuplicateWindowMinutes));
        var query = await _quotes.GetQueryableAsync();
        var duplicate = await query.Where(x => x.SubmissionHash == hash && x.CreationTime >= duplicateCutoff)
            .OrderByDescending(x => x.CreationTime).FirstOrDefaultAsync(cancellationToken);
        if (duplicate is not null)
        {
            await persistenceUnitOfWork.CompleteAsync(cancellationToken);
            return Result(duplicate, duplicate: true);
        }

        string? productName = null;
        if (normalized.ProductId.HasValue)
        {
            var product = await _products.FindAsync(normalized.ProductId.Value, cancellationToken: cancellationToken);
            if (product is null || !product.IsActive)
                throw new BusinessException(QuoteRequestErrorCodes.InvalidRequest, "The selected product is unavailable.");
            productName = product.Name;
        }

        var quote = new QuoteRequest(GuidGenerator.Create())
        {
            Reference = await _references.CreateAsync(_options.ReferencePrefix),
            ServiceType = normalized.ServiceType,
            ServiceTypeOther = normalized.ServiceTypeOther,
            ProductId = normalized.ProductId,
            ProductNameSnapshot = productName,
            Quantity = normalized.Quantity,
            Width = normalized.Width,
            Height = normalized.Height,
            DimensionUnit = normalized.DimensionUnit,
            RequiredDate = normalized.RequiredDate,
            FulfilmentPreference = normalized.FulfilmentPreference,
            DeliverySuburb = normalized.DeliverySuburb,
            CustomerName = normalized.CustomerName,
            CustomerEmail = normalized.CustomerEmail,
            CustomerPhone = normalized.CustomerPhone,
            OrganisationName = normalized.OrganisationName,
            Notes = normalized.Notes,
            Status = QuoteRequestStatus.New,
            SubmissionHash = hash,
            SubmissionKey = normalized.SubmissionKey,
            SourcePath = normalized.SourcePath,
            ClientIpHash = QuoteSubmissionValidator.HashClientIp(clientIp, _options.IpHashKey),
            InternalNotificationStatus = QuoteNotificationStatus.NotAttempted,
            CustomerAcknowledgementStatus = QuoteNotificationStatus.NotAttempted,
        };
        foreach (var attachment in claimed)
        {
            attachment.QuoteRequestId = quote.Id;
            attachment.StagedUntil = null;
            quote.Attachments.Add(attachment);
        }

        await _quotes.InsertAsync(quote, autoSave: true, cancellationToken: cancellationToken);
        await persistenceUnitOfWork.CompleteAsync(cancellationToken);
        Logger.LogInformation("[QuoteRequest] Persisted {QuoteId} reference {Reference}; no order, price, payment, inventory or production action.",
            quote.Id, quote.Reference);

        using var notificationUnitOfWork = UnitOfWorkManager.Begin(requiresNew: true, isTransactional: true);
        try
        {
            quote.InternalNotificationStatus = await _email.SendInternalAsync(quote, cancellationToken)
                ? QuoteNotificationStatus.Sent : QuoteNotificationStatus.Failed;
        }
        catch { quote.InternalNotificationStatus = QuoteNotificationStatus.Failed; }
        try
        {
            quote.CustomerAcknowledgementStatus = await _email.SendCustomerAcknowledgementAsync(quote, cancellationToken)
                ? QuoteNotificationStatus.Sent : QuoteNotificationStatus.Failed;
        }
        catch { quote.CustomerAcknowledgementStatus = QuoteNotificationStatus.Failed; }
        await _quotes.UpdateAsync(quote, autoSave: true, cancellationToken: cancellationToken);
        await notificationUnitOfWork.CompleteAsync(cancellationToken);
        return Result(quote, duplicate: false);
    }

    public async Task<PagedResultDto<QuoteRequestSummaryDto>> GetListAsync(GetQuoteRequestsInput input, CancellationToken cancellationToken = default)
    {
        var query = await _quotes.GetQueryableAsync();
        if (input.Status.HasValue) query = query.Where(x => x.Status == input.Status);
        if (input.ServiceType.HasValue) query = query.Where(x => x.ServiceType == input.ServiceType);
        var count = await query.CountAsync(cancellationToken);
        var rows = await query.OrderByDescending(x => x.CreationTime).Skip(input.SkipCount).Take(input.MaxResultCount)
            .Select(x => new QuoteRequestSummaryDto
            {
                Id = x.Id, Reference = x.Reference, ServiceType = x.ServiceType,
                CustomerName = x.CustomerName, CustomerEmail = x.CustomerEmail, Status = x.Status,
                Quantity = x.Quantity, RequiredDate = x.RequiredDate, AttachmentCount = x.Attachments.Count,
                InternalNotificationStatus = x.InternalNotificationStatus,
                CustomerAcknowledgementStatus = x.CustomerAcknowledgementStatus, CreationTime = x.CreationTime,
            }).ToListAsync(cancellationToken);
        return new PagedResultDto<QuoteRequestSummaryDto>(count, rows);
    }

    public async Task<QuoteRequestDto> GetAsync(Guid id, CancellationToken cancellationToken = default)
        => ToDto(await FindWithAttachmentsAsync(id, cancellationToken));

    public Task<QuoteRequestDto> MarkReviewedAsync(Guid id, CancellationToken cancellationToken = default)
        => TransitionAsync(id, QuoteRequestStatus.Reviewed, cancellationToken);
    public Task<QuoteRequestDto> CancelAsync(Guid id, CancellationToken cancellationToken = default)
        => TransitionAsync(id, QuoteRequestStatus.Cancelled, cancellationToken);
    public Task<QuoteRequestDto> MarkSpamAsync(Guid id, CancellationToken cancellationToken = default)
        => TransitionAsync(id, QuoteRequestStatus.Spam, cancellationToken);

    public async Task<QuoteRequestDto> ResendNotificationAsync(Guid id, ResendQuoteNotificationDto input, CancellationToken cancellationToken = default)
    {
        var quote = await FindWithAttachmentsAsync(id, cancellationToken);
        if (string.Equals(input.Channel, "internal", StringComparison.OrdinalIgnoreCase))
        {
            if (quote.InternalNotificationStatus == QuoteNotificationStatus.Sent) return ToDto(quote);
            quote.InternalNotificationStatus = await _email.SendInternalAsync(quote, cancellationToken)
                ? QuoteNotificationStatus.Sent : QuoteNotificationStatus.Failed;
        }
        else if (string.Equals(input.Channel, "customer", StringComparison.OrdinalIgnoreCase))
        {
            if (quote.CustomerAcknowledgementStatus == QuoteNotificationStatus.Sent) return ToDto(quote);
            quote.CustomerAcknowledgementStatus = await _email.SendCustomerAcknowledgementAsync(quote, cancellationToken)
                ? QuoteNotificationStatus.Sent : QuoteNotificationStatus.Failed;
        }
        else throw new BusinessException(QuoteRequestErrorCodes.InvalidRequest, "Notification channel must be internal or customer.");
        await _quotes.UpdateAsync(quote, autoSave: true, cancellationToken: cancellationToken);
        return ToDto(quote);
    }

    public async Task<OpenedQuoteAttachment> OpenAttachmentAsync(Guid id, Guid attachmentId, CancellationToken cancellationToken = default)
    {
        var attachment = await _attachments.FindAsync(x => x.Id == attachmentId && x.QuoteRequestId == id,
            cancellationToken: cancellationToken) ?? throw new EntityNotFoundException(typeof(QuoteRequestAttachment), attachmentId);
        var stream = await _storage.OpenReadAsync(attachment.ObjectKey, cancellationToken);
        var extension = attachment.ContentType switch
        {
            "image/png" => ".png", "image/jpeg" => ".jpg", "image/webp" => ".webp",
            "application/pdf" => ".pdf", "application/postscript" => ".ai", _ => ".bin",
        };
        return new OpenedQuoteAttachment(stream, attachment.ContentType, $"quote-artwork-{attachment.Id:N}{extension}");
    }

    private async Task<List<QuoteRequestAttachment>> ResolveAttachmentsAsync(
        IReadOnlyList<string>? tokens, DateTime now, Guid? existingQuoteId, CancellationToken cancellationToken)
    {
        tokens ??= [];
        if (tokens.Count > _options.MaxAttachments)
            throw new BusinessException(QuoteRequestErrorCodes.AttachmentConflict, "Too many attachments were selected.");
        var hashes = tokens.Where(x => !string.IsNullOrWhiteSpace(x)).Select(QuoteAttachmentService.Sha256).Distinct().ToList();
        if (hashes.Count != tokens.Count)
            throw new BusinessException(QuoteRequestErrorCodes.AttachmentConflict, "Attachment tokens must be unique.");
        if (hashes.Count == 0) return [];
        var query = await _attachments.GetQueryableAsync();
        var rows = await query.Where(x => hashes.Contains(x.UploadTokenHash)).ToListAsync(cancellationToken);
        var invalid = existingQuoteId.HasValue
            ? rows.Any(x => x.QuoteRequestId != existingQuoteId)
            : rows.Any(x => x.QuoteRequestId != null || x.StagedUntil == null || x.StagedUntil <= now);
        if (rows.Count != hashes.Count || invalid)
            throw new BusinessException(QuoteRequestErrorCodes.AttachmentExpired, "An attachment token is invalid, expired or already used.");
        if (rows.Sum(x => x.SizeBytes) > _options.MaxTotalAttachmentBytes)
            throw new BusinessException(QuoteRequestErrorCodes.AttachmentConflict, "The attachments exceed the total size limit.");
        return rows;
    }

    private async Task<QuoteRequestDto> TransitionAsync(Guid id, QuoteRequestStatus target, CancellationToken cancellationToken)
    {
        var quote = await FindWithAttachmentsAsync(id, cancellationToken);
        var allowed = target switch
        {
            QuoteRequestStatus.Reviewed => quote.Status == QuoteRequestStatus.New,
            QuoteRequestStatus.Cancelled or QuoteRequestStatus.Spam => quote.Status is QuoteRequestStatus.New or QuoteRequestStatus.Reviewed,
            _ => false,
        };
        if (!allowed) throw new BusinessException(QuoteRequestErrorCodes.InvalidTransition, "That quote status transition is not allowed.");
        quote.Status = target;
        await _quotes.UpdateAsync(quote, autoSave: true, cancellationToken: cancellationToken);
        return ToDto(quote);
    }

    private async Task<QuoteRequest> FindWithAttachmentsAsync(Guid id, CancellationToken cancellationToken)
    {
        var query = await _quotes.WithDetailsAsync(x => x.Attachments);
        return await query.SingleOrDefaultAsync(x => x.Id == id, cancellationToken)
            ?? throw new EntityNotFoundException(typeof(QuoteRequest), id);
    }

    private void RequireOperational()
    {
        if (!_options.Enabled) throw new BusinessException(QuoteRequestErrorCodes.Disabled, "Quote requests are not enabled.");
        if (_options.RetentionDays is null or <= 0)
            throw new BusinessException(QuoteRequestErrorCodes.Disabled, "Quote request retention is not configured.");
    }

    private static QuoteRequestResultDto Result(QuoteRequest quote, bool duplicate) => new()
    {
        Id = quote.Id, Reference = quote.Reference, Status = quote.Status, WasDuplicate = duplicate,
        Message = "Thanks, we received your quote request. No payment has been taken.",
    };

    private static QuoteRequestDto ToDto(QuoteRequest x) => new()
    {
        Id = x.Id, Reference = x.Reference, ServiceType = x.ServiceType, ServiceTypeOther = x.ServiceTypeOther,
        ProductId = x.ProductId, ProductNameSnapshot = x.ProductNameSnapshot, Quantity = x.Quantity,
        Width = x.Width, Height = x.Height, DimensionUnit = x.DimensionUnit, RequiredDate = x.RequiredDate,
        FulfilmentPreference = x.FulfilmentPreference, DeliverySuburb = x.DeliverySuburb,
        CustomerName = x.CustomerName, CustomerEmail = x.CustomerEmail, CustomerPhone = x.CustomerPhone,
        OrganisationName = x.OrganisationName, Notes = x.Notes, Status = x.Status,
        InternalNotificationStatus = x.InternalNotificationStatus,
        CustomerAcknowledgementStatus = x.CustomerAcknowledgementStatus, SourcePath = x.SourcePath,
        CreationTime = x.CreationTime,
        AttachmentCount = x.Attachments.Count,
        Attachments = x.Attachments.OrderBy(a => a.CreationTime).Select(a => new QuoteRequestAttachmentDto
        {
            Id = a.Id, FileName = a.OriginalFileName, ContentType = a.ContentType,
            SizeBytes = a.SizeBytes, Sha256 = a.Sha256, ScanStatus = a.ScanStatus,
        }).ToList(),
    };
}
