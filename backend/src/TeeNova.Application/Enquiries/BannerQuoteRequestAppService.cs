using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using TeeNova.Catalog;
using TeeNova.Email;
using TeeNova.Enquiries.Dtos;
using TeeNova.Orders;
using Volo.Abp;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Entities;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Enquiries;

/// <summary>
/// Banner quote enquiry service (Jira 9512). Persists a customer Banner requirement as a standalone
/// <see cref="BannerQuoteRequest"/> — never an order, never a payment. This is the enquiry-first path the
/// 9511 checkout guard reserves for Banner (<c>CustomQuoteOnly</c>): the storefront submits here instead
/// of paid checkout, and an admin quotes manually afterwards.
/// </summary>
public class BannerQuoteRequestAppService : ApplicationService, IBannerQuoteRequestAppService
{
    private readonly IRepository<BannerQuoteRequest, Guid> _repository;
    private readonly IRepository<Product, Guid>            _productRepository;
    private readonly IRepository<Order, Guid>              _orderRepository;
    private readonly IRepository<OrderTimelineEntry, Guid> _timelineRepository;
    private readonly BannerDetailValidator                 _bannerDetailValidator;
    private readonly IBannerEnquiryEmailService            _emailService;

    public BannerQuoteRequestAppService(
        IRepository<BannerQuoteRequest, Guid> repository,
        IRepository<Product, Guid>            productRepository,
        IRepository<Order, Guid>              orderRepository,
        IRepository<OrderTimelineEntry, Guid> timelineRepository,
        BannerDetailValidator                 bannerDetailValidator,
        IBannerEnquiryEmailService            emailService)
    {
        _repository            = repository;
        _productRepository     = productRepository;
        _orderRepository       = orderRepository;
        _timelineRepository    = timelineRepository;
        _bannerDetailValidator = bannerDetailValidator;
        _emailService          = emailService;
    }

    public async Task<BannerEnquiryResultDto> CreateAsync(CreateBannerEnquiryDto input)
    {
        if (input.ProductId == Guid.Empty)
            throw new BusinessException("TeeNova:BannerEnquiry:BannerEnquiryProductRequired");

        var product = await _productRepository.FindAsync(input.ProductId)
            ?? throw new BusinessException("TeeNova:BannerEnquiry:BannerEnquiryProductNotFound")
                .WithData("ProductId", input.ProductId);

        if (!product.IsActive)
            throw new BusinessException("TeeNova:BannerEnquiry:BannerEnquiryProductNotAvailable")
                .WithData("ProductId", product.Id);

        if (product.Kind != ProductKind.Banner)
            throw new BusinessException("TeeNova:BannerEnquiry:BannerEnquiryRequiresBannerProduct")
                .WithData("ProductId", product.Id)
                .WithData("Kind", product.Kind);

        if (product.PricingModel != PricingModel.CustomQuoteOnly)
            throw new BusinessException("TeeNova:BannerEnquiry:BannerEnquiryRequiresCustomQuoteOnly")
                .WithData("ProductId", product.Id)
                .WithData("PricingModel", product.PricingModel);

        if (input.Quantity < product.MinimumQuantity)
            throw new BusinessException("TeeNova:BannerEnquiry:BannerEnquiryQuantityBelowMinimum")
                .WithData("MinimumQuantity", product.MinimumQuantity)
                .WithData("Quantity", input.Quantity);

        if (product.DesignUploadRequired
            && input.UploadedAssetId == null
            && string.IsNullOrWhiteSpace(input.UploadedAssetUrl))
            throw new BusinessException("TeeNova:BannerEnquiry:BannerEnquiryDesignRequired")
                .WithData("ProductId", product.Id);

        // Authoritative Banner-config validation + normalization + server-side area (reused from 9511).
        var detail = _bannerDetailValidator.ValidateAndNormalize(input.BannerDetail);

        var entity = new BannerQuoteRequest(GuidGenerator.Create())
        {
            ProductId           = product.Id,
            ProductNameSnapshot = product.Name,
            Quantity            = input.Quantity,
            CustomerName        = input.CustomerName.Trim(),
            CustomerEmail       = input.CustomerEmail.Trim(),
            CustomerPhone       = string.IsNullOrWhiteSpace(input.CustomerPhone) ? null : input.CustomerPhone.Trim(),
            Message             = string.IsNullOrWhiteSpace(input.Message) ? null : input.Message.Trim(),
            UploadedAssetId     = input.UploadedAssetId,
            UploadedAssetUrl    = string.IsNullOrWhiteSpace(input.UploadedAssetUrl) ? null : input.UploadedAssetUrl.Trim(),
            DesignNote          = string.IsNullOrWhiteSpace(input.DesignNote) ? null : input.DesignNote.Trim(),

            SizeMode             = detail.SizeMode,
            SizePresetId         = detail.SizePresetId,
            SizeLabel            = detail.SizeLabel,
            Width                = detail.Width,
            Height               = detail.Height,
            Unit                 = detail.Unit,
            AreaSquareMetres     = detail.AreaSquareMetres,
            Material             = detail.Material,
            MaterialDisplayName  = detail.MaterialDisplayName,
            FinishingEyelets     = detail.FinishingEyelets,
            FinishingHemming     = detail.FinishingHemming,
            FinishingPolePocket  = detail.FinishingPolePocket,
            FinishingOther       = detail.FinishingOther,
            StandIncluded        = detail.StandIncluded,
            StandReplacementOnly = detail.StandReplacementOnly,
            BannerNotes          = detail.Notes,

            Status = BannerQuoteRequestStatus.New,
        };

        await _repository.InsertAsync(entity, autoSave: true);

        Logger.LogInformation(
            "[BannerEnquiry] Created enquiry {Id} for product {ProductId} qty {Quantity} (no order, no payment)",
            entity.Id, product.Id, input.Quantity);

        // Notifications are best-effort and must never fail the submission (Jira 9513). They send no
        // payment link and never imply the order is paid/confirmed.
        try { await _emailService.SendAdminNewEnquiryNotificationAsync(entity); }
        catch (Exception ex) { Logger.LogError(ex, "[BannerEnquiry] Admin notification failed for {Id}", entity.Id); }

        try { await _emailService.SendCustomerAcknowledgementAsync(entity); }
        catch (Exception ex) { Logger.LogError(ex, "[BannerEnquiry] Customer acknowledgement failed for {Id}", entity.Id); }

        return new BannerEnquiryResultDto
        {
            Id               = entity.Id,
            Status           = entity.Status,
            ProductId        = product.Id,
            ProductName      = product.Name,
            Quantity         = entity.Quantity,
            AreaSquareMetres = entity.AreaSquareMetres,
            Message          = "Thanks, we received your banner quote request. We'll confirm the price before any payment.",
        };
    }

    public async Task<PagedResultDto<BannerQuoteRequestDto>> GetListAsync(GetBannerQuoteRequestsInput input)
    {
        var query = await _repository.GetQueryableAsync();
        if (input.Status.HasValue)
            query = query.Where(r => r.Status == input.Status.Value);

        var totalCount = await query.CountAsync();
        var items = await query
            .OrderByDescending(r => r.CreationTime)
            .Skip(input.SkipCount)
            .Take(input.MaxResultCount)
            .ToListAsync();

        return new PagedResultDto<BannerQuoteRequestDto>(
            totalCount,
            items.Select(i => ObjectMapper.Map<BannerQuoteRequest, BannerQuoteRequestDto>(i)).ToList());
    }

    public async Task<BannerQuoteRequestDto> GetAsync(Guid id)
    {
        var entity = await _repository.FindAsync(id)
            ?? throw new EntityNotFoundException(typeof(BannerQuoteRequest), id);
        return ObjectMapper.Map<BannerQuoteRequest, BannerQuoteRequestDto>(entity);
    }

    public async Task<BannerQuoteRequestDto> MarkReviewedAsync(Guid id)
    {
        var entity = await _repository.FindAsync(id)
            ?? throw new EntityNotFoundException(typeof(BannerQuoteRequest), id);

        if (entity.Status == BannerQuoteRequestStatus.New)
            entity.Status = BannerQuoteRequestStatus.Reviewed;

        await _repository.UpdateAsync(entity, autoSave: true);
        return ObjectMapper.Map<BannerQuoteRequest, BannerQuoteRequestDto>(entity);
    }

    public async Task<BannerQuoteRequestDto> CancelAsync(Guid id)
    {
        var entity = await _repository.FindAsync(id)
            ?? throw new EntityNotFoundException(typeof(BannerQuoteRequest), id);

        if (entity.Status == BannerQuoteRequestStatus.ConvertedToOrder)
            throw new BusinessException("TeeNova:BannerEnquiry:BannerQuoteRequestAlreadyConverted")
                .WithData("Id", id);

        entity.Status = BannerQuoteRequestStatus.Cancelled;
        await _repository.UpdateAsync(entity, autoSave: true);
        return ObjectMapper.Map<BannerQuoteRequest, BannerQuoteRequestDto>(entity);
    }

    public async Task<ConvertBannerQuoteRequestResultDto> ConvertToOrderAsync(Guid id, ConvertBannerQuoteRequestDto input)
    {
        var entity = await _repository.FindAsync(id)
            ?? throw new EntityNotFoundException(typeof(BannerQuoteRequest), id);

        // Status guards — duplicate / cancelled conversions are rejected (race-safe via the aggregate's
        // concurrency stamp on save).
        if (entity.Status == BannerQuoteRequestStatus.ConvertedToOrder || entity.ConvertedOrderId != null)
            throw new BusinessException("TeeNova:BannerEnquiry:BannerQuoteRequestAlreadyConverted")
                .WithData("Id", id);
        if (entity.Status == BannerQuoteRequestStatus.Cancelled)
            throw new BusinessException("TeeNova:BannerEnquiry:BannerQuoteRequestCancelled")
                .WithData("Id", id);
        if (entity.Status is not (BannerQuoteRequestStatus.New or BannerQuoteRequestStatus.Reviewed))
            throw new BusinessException("TeeNova:BannerEnquiry:BannerQuoteRequestCannotConvert")
                .WithData("Id", id)
                .WithData("Status", entity.Status);

        if (input.QuotedTotal <= 0m)
            throw new BusinessException("TeeNova:BannerEnquiry:BannerQuoteRequiresPositiveTotal");

        if (string.IsNullOrWhiteSpace(entity.CustomerEmail) || string.IsNullOrWhiteSpace(entity.CustomerName))
            throw new BusinessException("TeeNova:BannerEnquiry:BannerQuoteConversionFailed")
                .WithData("Reason", "Customer contact is incomplete");

        // Build an UNPAID order via this admin-only internal path (NOT the customer CreateAsync, whose
        // 9511 CustomQuoteOnly guard stays intact). No payment session, never marked paid.
        var address = new ShippingAddress(
            entity.CustomerName, string.Empty, string.Empty, null, string.Empty, "NZ", null, entity.CustomerPhone);

        var order = new Order(GuidGenerator.Create(), entity.CustomerName, entity.CustomerEmail, address)
        {
            DeliveryMethod = input.DeliveryMethod,
            Notes          = string.IsNullOrWhiteSpace(input.CustomerNote) ? null : input.CustomerNote.Trim(),
            AdminNotes     = BuildAdminNotes(entity, input.AdminNote),
        };

        // Unit price is a per-unit display value; the authoritative order total is set by AdjustPrice below.
        var unitPrice = decimal.Round(input.QuotedTotal / entity.Quantity, 4, MidpointRounding.AwayFromZero);

        var item = new OrderItem(
            GuidGenerator.Create(), order.Id,
            entity.ProductId, productVariantId: null,
            entity.ProductNameSnapshot, variantLabel: null,
            entity.Quantity, unitPrice)
        {
            PricingModel     = PricingModel.CustomQuoteOnly,
            ProductKind      = ProductKind.Banner,
            UploadedAssetId  = entity.UploadedAssetId,
            UploadedAssetUrl = entity.UploadedAssetUrl,
            DesignNote       = entity.DesignNote,
        };
        item.BannerDetail = new OrderItemBannerDetail(GuidGenerator.Create(), item.Id)
        {
            SizeMode             = entity.SizeMode,
            SizePresetId         = entity.SizePresetId,
            SizeLabel            = entity.SizeLabel,
            Width                = entity.Width,
            Height               = entity.Height,
            Unit                 = entity.Unit,
            AreaSquareMetres     = entity.AreaSquareMetres,
            Material             = entity.Material,
            MaterialDisplayName  = entity.MaterialDisplayName,
            FinishingEyelets     = entity.FinishingEyelets,
            FinishingHemming     = entity.FinishingHemming,
            FinishingPolePocket  = entity.FinishingPolePocket,
            FinishingOther       = entity.FinishingOther,
            StandIncluded        = entity.StandIncluded,
            StandReplacementOnly = entity.StandReplacementOnly,
            Notes                = entity.BannerNotes,
        };

        order.AddItem(item);
        order.InitializePaymentRequirement();
        // Force the exact admin-quoted total (and recalc payment) — never a $0 order.
        order.AdjustPrice(input.QuotedTotal, Clock.Now);

        await _orderRepository.InsertAsync(order, autoSave: true);

        await _timelineRepository.InsertAsync(new OrderTimelineEntry(
            GuidGenerator.Create(), order.Id, OrderEventType.StatusChanged,
            $"Order created from banner quote request {entity.Id.ToString("N")[..8].ToUpperInvariant()} (unpaid; admin-quoted total).",
            order.Status), autoSave: true);

        entity.Status           = BannerQuoteRequestStatus.ConvertedToOrder;
        entity.ConvertedOrderId = order.Id;
        await _repository.UpdateAsync(entity, autoSave: true);

        Logger.LogInformation(
            "[BannerEnquiry] Converted enquiry {Id} -> order {OrderId} total {Total} (unpaid, no session)",
            entity.Id, order.Id, input.QuotedTotal);

        return new ConvertBannerQuoteRequestResultDto
        {
            QuoteRequestId = entity.Id,
            Status         = entity.Status,
            OrderId        = order.Id,
            OrderNumber    = order.OrderNumber,
            OrderTotal     = order.TotalAmount,
        };
    }

    private static string BuildAdminNotes(BannerQuoteRequest entity, string? adminNote)
    {
        var basis = $"Converted from banner quote request {entity.Id}.";
        return string.IsNullOrWhiteSpace(adminNote) ? basis : $"{basis}\n{adminNote.Trim()}";
    }
}
