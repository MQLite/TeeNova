using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TeeNova.Orders;
using TeeNova.Payments.Dtos;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Entities;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Payments;

/// <summary>
/// Admin READ-ONLY reconciliation service over <see cref="PaymentWebhookEvent"/> records (Jira 9810).
/// Provides visibility into RequiresManualReview / rejected / ignored / processed provider events so an
/// operator can reconcile against the provider dashboard. It performs NO mutation: it never resolves an
/// event, never applies payment, never marks an order paid, and never calls a provider. Every projected
/// field is safe (ids, codes, amount, currency, timestamps) — the entity holds no raw payload or secret.
/// </summary>
public class PaymentWebhookEventAdminAppService : ApplicationService, IPaymentWebhookEventAdminAppService
{
    private readonly IRepository<PaymentWebhookEvent, Guid> _webhookEventRepository;
    private readonly IRepository<Order, Guid>               _orderRepository;

    public PaymentWebhookEventAdminAppService(
        IRepository<PaymentWebhookEvent, Guid> webhookEventRepository,
        IRepository<Order, Guid>               orderRepository)
    {
        _webhookEventRepository = webhookEventRepository;
        _orderRepository        = orderRepository;
    }

    public async Task<PagedResultDto<PaymentWebhookEventDto>> GetListAsync(GetPaymentWebhookEventsInput input)
    {
        var query = await _webhookEventRepository.GetQueryableAsync();

        if (input.RequiresManualReview.HasValue)
            query = query.Where(e => e.RequiresManualReview == input.RequiresManualReview.Value);

        if (input.Status.HasValue)
            query = query.Where(e => e.Status == input.Status.Value);

        if (input.Provider.HasValue)
            query = query.Where(e => e.Provider == input.Provider.Value);

        if (input.OrderId.HasValue)
            query = query.Where(e => e.OrderId == input.OrderId.Value);

        if (!string.IsNullOrWhiteSpace(input.ProviderSessionId))
        {
            var providerSessionId = input.ProviderSessionId.Trim();
            query = query.Where(e => e.ProviderSessionId == providerSessionId);
        }

        if (input.FromDate.HasValue)
            query = query.Where(e => e.ReceivedAt >= input.FromDate.Value);

        if (input.ToDate.HasValue)
            query = query.Where(e => e.ReceivedAt <= input.ToDate.Value);

        var totalCount = await query.CountAsync();

        // Default ordering prioritizes items needing attention (manual review) then most-recent (Jira 9810).
        var events = await query
            .OrderByDescending(e => e.RequiresManualReview)
            .ThenByDescending(e => e.ReceivedAt)
            .Skip(input.SkipCount)
            .Take(input.MaxResultCount)
            .ToListAsync();

        var orderNumbers = await LoadOrderNumbersAsync(events);
        var dtos = events.Select(e => MapToDto(e, orderNumbers)).ToList();

        return new PagedResultDto<PaymentWebhookEventDto>(totalCount, dtos);
    }

    public async Task<PaymentWebhookEventDto> GetAsync(Guid id)
    {
        var ev = await _webhookEventRepository.FindAsync(id)
            ?? throw new EntityNotFoundException(typeof(PaymentWebhookEvent), id);

        var orderNumbers = await LoadOrderNumbersAsync(new[] { ev });
        return MapToDto(ev, orderNumbers);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private async Task<Dictionary<Guid, string>> LoadOrderNumbersAsync(
        IReadOnlyCollection<PaymentWebhookEvent> events)
    {
        var orderIds = events
            .Where(e => e.OrderId.HasValue)
            .Select(e => e.OrderId!.Value)
            .Distinct()
            .ToList();

        if (orderIds.Count == 0)
            return new Dictionary<Guid, string>();

        var orderQuery = await _orderRepository.GetQueryableAsync();
        return await orderQuery
            .Where(o => orderIds.Contains(o.Id))
            .Select(o => new { o.Id, o.OrderNumber })
            .ToDictionaryAsync(o => o.Id, o => o.OrderNumber);
    }

    private static PaymentWebhookEventDto MapToDto(
        PaymentWebhookEvent e, Dictionary<Guid, string> orderNumbers)
        => new()
        {
            Id                     = e.Id,
            Provider               = e.Provider,
            ProviderEventId        = e.ProviderEventId,
            ProviderEventType      = e.ProviderEventType,
            ProviderSessionId      = e.ProviderSessionId,
            PaymentIntentId        = e.PaymentIntentId,
            Status                 = e.Status,
            RequiresManualReview   = e.RequiresManualReview,
            RejectionCode          = e.RejectionCode,
            Message                = e.Message,
            OrderId                = e.OrderId,
            OrderNumber            = e.OrderId.HasValue && orderNumbers.TryGetValue(e.OrderId.Value, out var n)
                                        ? n : null,
            OnlinePaymentSessionId = e.OnlinePaymentSessionId,
            Amount                 = e.Amount,
            Currency               = e.Currency,
            ReceivedAt             = e.ReceivedAt,
            ProcessedAt            = e.ProcessedAt,
            LastSeenAt             = e.LastSeenAt,
            DuplicateCount         = e.DuplicateCount,
        };
}
