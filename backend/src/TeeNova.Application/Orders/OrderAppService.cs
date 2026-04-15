using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TeeNova.Customization;
using TeeNova.Orders.Dtos;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Orders;

public class OrderAppService : ApplicationService, IOrderAppService
{
    private readonly IRepository<Order, Guid> _orderRepository;
    private readonly IRepository<Catalog.Product, Guid> _productRepository;

    public OrderAppService(
        IRepository<Order, Guid> orderRepository,
        IRepository<Catalog.Product, Guid> productRepository)
    {
        _orderRepository = orderRepository;
        _productRepository = productRepository;
    }

    public async Task<OrderDto> CreateAsync(CreateOrderDto input)
    {
        var address = new ShippingAddress(
            input.ShippingAddress.FullName,
            input.ShippingAddress.AddressLine1,
            input.ShippingAddress.City,
            input.ShippingAddress.State,
            input.ShippingAddress.PostalCode,
            input.ShippingAddress.Country,
            input.ShippingAddress.AddressLine2,
            input.ShippingAddress.Phone);

        var customerName = input.ShippingAddress.FullName;
        var order = new Order(GuidGenerator.Create(), customerName, input.CustomerEmail, address)
        {
            Notes = input.Notes
        };

        foreach (var itemDto in input.Items)
        {
            var productQuery = await _productRepository.GetQueryableAsync();
            var product = await productQuery
                .Include(p => p.Variants)
                .FirstOrDefaultAsync(p => p.Id == itemDto.ProductId)
                ?? throw new Volo.Abp.Domain.Entities.EntityNotFoundException(
                    typeof(Catalog.Product), itemDto.ProductId);

            var variant = product.Variants.FirstOrDefault(v => v.Id == itemDto.ProductVariantId)
                ?? throw new Volo.Abp.BusinessException("TeeNova:Catalog:VariantNotFound");

            var effectivePrice = product.BasePrice + variant.PriceAdjustment;
            var variantLabel = $"{variant.Color} / {variant.Size}";

            var item = new OrderItem(
                GuidGenerator.Create(), order.Id,
                product.Id, variant.Id,
                product.Name, variantLabel,
                itemDto.Quantity, effectivePrice);

            if (itemDto.PrintPositions?.Count > 0)
                SyncPositionAssets(item, itemDto.PrintPositions);

            order.AddItem(item);
        }

        await _orderRepository.InsertAsync(order, autoSave: true);

        return ObjectMapper.Map<Order, OrderDto>(order);
    }

    public async Task<OrderDto> GetAsync(Guid id)
    {
        var query = await _orderRepository.GetQueryableAsync();
        var order = await query
            .Include(o => o.Items)
            .ThenInclude(i => i.PositionAssets)
            .FirstOrDefaultAsync(o => o.Id == id);

        if (order == null)
            throw new Volo.Abp.Domain.Entities.EntityNotFoundException(typeof(Order), id);

        return ObjectMapper.Map<Order, OrderDto>(order);
    }

    public async Task<PagedResultDto<OrderDto>> GetListAsync(GetOrdersInput input)
    {
        var query = await _orderRepository.GetQueryableAsync();
        query = query
            .Include(o => o.Items)
            .ThenInclude(i => i.PositionAssets);

        // TODO: apply input.Status, input.Search, input.DateFrom, input.DateTo filters

        var totalCount = await query.CountAsync();
        var orders = await query
            .OrderByDescending(o => o.CreationTime)
            .Skip(input.SkipCount)
            .Take(input.MaxResultCount)
            .ToListAsync();

        return new PagedResultDto<OrderDto>(
            totalCount,
            ObjectMapper.Map<List<Order>, List<OrderDto>>(orders)
        );
    }

    public async Task<OrderItemDto> UpdateItemDesignAsync(Guid orderId, Guid itemId, UpdateOrderItemDesignDto input)
    {
        var query = await _orderRepository.GetQueryableAsync();
        var order = await query
            .Include(o => o.Items)
            .ThenInclude(i => i.PositionAssets)
            .FirstOrDefaultAsync(o => o.Id == orderId)
            ?? throw new Volo.Abp.Domain.Entities.EntityNotFoundException(typeof(Order), orderId);

        var item = order.Items.FirstOrDefault(i => i.Id == itemId)
            ?? throw new Volo.Abp.Domain.Entities.EntityNotFoundException(typeof(OrderItem), itemId);

        item.UpsertPositionAsset(
            GuidGenerator.Create(),
            input.Position,
            input.UploadedAssetId,
            input.UploadedAssetUrl,
            input.DesignNote);

        await _orderRepository.UpdateAsync(order, autoSave: true);

        return ObjectMapper.Map<OrderItem, OrderItemDto>(item);
    }

    public async Task<OrderDto> UpdateStatusAsync(Guid id, UpdateOrderStatusDto input)
    {
        return await ChangeStatusAsync(id, input.NewStatus);
    }

    private static void SyncPositionAssets(OrderItem item, IEnumerable<CreateOrderItemPositionDto> positions)
    {
        item.SetPositionAssets(
            positions.Select(position => new OrderItemPositionAsset(
                Guid.NewGuid(),
                item.Id,
                ParsePosition(position.Position),
                position.AssetId,
                position.AssetUrl,
                position.DesignNote)));
    }

    private static PrintPosition ParsePosition(string rawPosition)
    {
        if (Enum.TryParse<PrintPosition>(rawPosition, ignoreCase: true, out var position))
            return position;

        throw new Volo.Abp.BusinessException("TeeNova:Order:InvalidPrintPosition")
            .WithData("Position", rawPosition);
    }

    public async Task<OrderDto> MarkPaidAsync(Guid id)
        => await ChangeStatusAsync(id, OrderStatus.Paid);

    public async Task<OrderDto> StartReviewAsync(Guid id)
        => await ChangeStatusAsync(id, OrderStatus.Reviewing);

    public async Task<OrderDto> ReopenAsync(Guid id)
    {
        var order = await _orderRepository.GetAsync(id);
        order.Reopen(Clock.Now);
        await _orderRepository.UpdateAsync(order, autoSave: true);

        var query = await _orderRepository.GetQueryableAsync();
        var full = await query
            .Include(o => o.Items)
            .ThenInclude(i => i.PositionAssets)
            .FirstOrDefaultAsync(o => o.Id == id);

        return ObjectMapper.Map<Order, OrderDto>(full ?? order);
    }

    private async Task<OrderDto> ChangeStatusAsync(Guid id, OrderStatus newStatus)
    {
        var order = await _orderRepository.GetAsync(id);
        order.UpdateStatus(newStatus);
        await _orderRepository.UpdateAsync(order, autoSave: true);

        var query = await _orderRepository.GetQueryableAsync();
        var full = await query
            .Include(o => o.Items)
            .ThenInclude(i => i.PositionAssets)
            .FirstOrDefaultAsync(o => o.Id == id);

        return ObjectMapper.Map<Order, OrderDto>(full ?? order);
    }
}
