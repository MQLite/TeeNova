using System;
using System.Collections.Generic;

namespace TeeNova.Dashboard.Dtos;

public class DashboardStatsDto
{
    // ── Orders ────────────────────────────────────────────────────────────────
    public int TotalOrders { get; set; }
    public int OrdersToday { get; set; }
    public int OrdersThisMonth { get; set; }
    public Dictionary<string, int> OrdersByStatus { get; set; } = new();

    // ── Revenue ───────────────────────────────────────────────────────────────
    public decimal TotalRevenue { get; set; }
    public decimal RevenueToday { get; set; }
    public decimal RevenueThisMonth { get; set; }

    // ── Catalog ───────────────────────────────────────────────────────────────
    public int TotalProducts { get; set; }
    public int ActiveProducts { get; set; }
    public int LowStockVariants { get; set; }

    // ── Recent orders (last 6) ────────────────────────────────────────────────
    public List<RecentOrderDto> RecentOrders { get; set; } = new();

    // ── Chart: daily order counts (last 7 days) ───────────────────────────────
    public List<DailyOrderCountDto> DailyOrderCounts { get; set; } = new();
}

public class RecentOrderDto
{
    public Guid Id { get; set; }
    public string OrderNumber { get; set; } = default!;
    public string CustomerName { get; set; } = default!;
    public decimal TotalAmount { get; set; }
    public string Status { get; set; } = default!;
    public DateTime CreationTime { get; set; }
    public int ItemCount { get; set; }
}

public class DailyOrderCountDto
{
    /// <summary>e.g. "04/08"</summary>
    public string Date { get; set; } = default!;
    public int Count { get; set; }
}
