using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TeeNova.Catalog;
using TeeNova.Dashboard.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;
using Volo.Abp.Timing;

namespace TeeNova.Dashboard;

public class DashboardAppService : ApplicationService, IDashboardAppService
{
    private readonly IRepository<Orders.Order, Guid> _orderRepository;
    private readonly IRepository<Product, Guid> _productRepository;
    private readonly IClock _clock;

    public DashboardAppService(
        IRepository<Orders.Order, Guid> orderRepository,
        IRepository<Product, Guid> productRepository,
        IClock clock)
    {
        _orderRepository = orderRepository;
        _productRepository = productRepository;
        _clock = clock;
    }

    public async Task<DashboardStatsDto> GetStatsAsync()
    {
        var today = _clock.Now.Date;
        var monthStart = new DateTime(today.Year, today.Month, 1);
        var sevenDaysAgo = today.AddDays(-6);

        var orderQuery = await _orderRepository.GetQueryableAsync();
        var orders = await orderQuery.Include(o => o.Items).ToListAsync();

        var productQuery = await _productRepository.GetQueryableAsync();
        var products = await productQuery.Include(p => p.Variants).ToListAsync();

        var ordersByStatus = orders
            .GroupBy(o => o.Status.ToString())
            .ToDictionary(g => g.Key, g => g.Count());

        var billable = orders.Where(o => o.Status != Orders.OrderStatus.Cancelled).ToList();

        var recentOrders = orders
            .OrderByDescending(o => o.CreationTime)
            .Take(6)
            .Select(o => new RecentOrderDto
            {
                Id = o.Id,
                OrderNumber = o.OrderNumber,
                CustomerName = o.CustomerName ?? o.CustomerEmail,
                TotalAmount = o.TotalAmount,
                Status = o.Status.ToString(),
                CreationTime = o.CreationTime,
                ItemCount = o.Items.Count,
            })
            .ToList();

        var dailyCounts = Enumerable.Range(0, 7)
            .Select(i =>
            {
                var day = sevenDaysAgo.AddDays(i);
                return new DailyOrderCountDto
                {
                    Date = day.ToString("MM/dd"),
                    Count = orders.Count(o => o.CreationTime.Date == day),
                };
            })
            .ToList();

        return new DashboardStatsDto
        {
            TotalOrders = orders.Count,
            OrdersToday = orders.Count(o => o.CreationTime.Date == today),
            OrdersThisMonth = orders.Count(o => o.CreationTime >= monthStart),
            OrdersByStatus = ordersByStatus,
            TotalRevenue = billable.Sum(o => o.TotalAmount),
            RevenueToday = billable.Where(o => o.CreationTime.Date == today).Sum(o => o.TotalAmount),
            RevenueThisMonth = billable.Where(o => o.CreationTime >= monthStart).Sum(o => o.TotalAmount),
            TotalProducts = products.Count,
            ActiveProducts = products.Count(p => p.IsActive),
            LowStockVariants = products.SelectMany(p => p.Variants).Count(v => v.StockQuantity <= 5),
            RecentOrders = recentOrders,
            DailyOrderCounts = dailyCounts,
        };
    }
}
