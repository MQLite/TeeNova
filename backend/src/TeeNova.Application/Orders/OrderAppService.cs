using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
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
                itemDto.Quantity, effectivePrice,
                itemDto.UploadedAssetId, itemDto.PrintPosition,
                itemDto.UploadedAssetUrl, itemDto.DesignNote);

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
            .FirstOrDefaultAsync(o => o.Id == id);

        if (order == null)
            throw new Volo.Abp.Domain.Entities.EntityNotFoundException(typeof(Order), id);

        return ObjectMapper.Map<Order, OrderDto>(order);
    }

    public async Task<PagedResultDto<OrderDto>> GetListAsync(PagedResultRequestDto input)
    {
        var query = await _orderRepository.GetQueryableAsync();
        query = query.Include(o => o.Items);

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

    public async Task<OrderDto> UpdateStatusAsync(Guid id, UpdateOrderStatusDto input)
    {
        var order = await _orderRepository.GetAsync(id);
        order.UpdateStatus(input.NewStatus);
        await _orderRepository.UpdateAsync(order, autoSave: true);
        return ObjectMapper.Map<Order, OrderDto>(order);
    }
}
