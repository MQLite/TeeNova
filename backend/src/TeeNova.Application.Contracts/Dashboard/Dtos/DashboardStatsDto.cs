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
    public int LowStockVariants { get; set; }   // StockQuantity <= 5

    // ── Recent orders (last 5) ────────────────────────────────────────────────
    public List<RecentOrderDto> RecentOrders { get; set; } = new();
}

public class RecentOrderDto
{
    public string OrderNumber { get; set; } = default!;
    public string CustomerName { get; set; } = default!;
    public decimal TotalAmount { get; set; }
    public string Status { get; set; } = default!;
    public System.DateTime CreationTime { get; set; }
}
