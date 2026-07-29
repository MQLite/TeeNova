using System;
using System.Collections.Generic;
using TeeNova.Catalog;
using TeeNova.Orders.Dtos;

namespace TeeNova.Orders;

/// <summary>
/// Shared, deterministic <see cref="OrderDto"/> fixtures for the Jira 10103 projection, helper and
/// production-PDF tests. Every id is a fixed literal so a fixture built twice is byte-comparable and a
/// generated PDF differs only by its rendering timestamp.
/// </summary>
public static class OrderProjectionFixtures
{
    public static Guid Id(int n) => new($"00000000-0000-0000-0000-{n:000000000000}");

    public static readonly Guid TeeProductId = Id(1);
    public static readonly Guid TeeTwinProductId = Id(2);
    public static readonly Guid BadgeProductId = Id(3);
    public static readonly Guid BannerProductId = Id(4);

    public static readonly Guid FrontAreaId = Id(101);
    public static readonly Guid BackAreaId = Id(102);
    public static readonly Guid A3SizeId = Id(201);
    public static readonly Guid A4SizeId = Id(202);

    public static OrderDto Order(params OrderItemDto[] items)
    {
        var dto = new OrderDto
        {
            Id = Id(9000),
            OrderNumber = "ORD-10103-TEST",
            Status = OrderStatus.Pending,
            DisplayStatus = "Pending",
            DeliveryMethod = TeeNova.Orders.DeliveryMethod.Shipping,
            CustomerName = "Ada Lovelace",
            CustomerEmail = "ada@example.test",
            TotalAmount = 0m,
            PaymentStatus = PaymentStatus.Unpaid,
            PaymentRequirementType = PaymentRequirementType.FullPaymentRequired,
            RequiredPaymentAmount = 0m,
            PaidAmount = 0m,
            BalanceAmount = 0m,
            CreationTime = new DateTime(2026, 7, 1, 9, 30, 0, DateTimeKind.Utc),
            Notes = "Customer note: please pack flat.",
            AdminNotes = "Admin note: rush job.",
            ShippingAddress = new ShippingAddressDto
            {
                FullName = "Ada Lovelace",
                AddressLine1 = "12 Queen Street",
                City = "Auckland",
                PostalCode = "1010",
                Country = "NZ",
                Phone = "021 555 0100",
            },
        };

        foreach (var item in items)
            dto.Items.Add(item);

        dto.TotalAmount = 0m;
        foreach (var item in items)
            dto.TotalAmount += item.UnitPrice * item.Quantity;

        return dto;
    }

    public static OrderItemDto Garment(
        Guid itemId,
        string? variantLabel = "Black / M",
        int quantity = 1,
        decimal unitPrice = 30m,
        Guid? productId = null,
        Guid? variantId = null,
        string productName = "Staple Tee",
        IEnumerable<OrderItemPrintDto>? prints = null)
    {
        var item = new OrderItemDto
        {
            Id = itemId,
            ProductId = productId ?? TeeProductId,
            ProductVariantId = variantId ?? Id(500),
            ProductName = productName,
            VariantLabel = variantLabel,
            Quantity = quantity,
            UnitPrice = unitPrice,
            PricingModel = PricingModel.GarmentPrint,
            ProductKind = ProductKind.Garment,
        };

        foreach (var print in prints ?? new[] { Print(Id(1000), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3") })
            item.Prints.Add(print);

        return item;
    }

    public static OrderItemPrintDto Print(
        Guid printId,
        Guid areaId,
        string areaName,
        string areaCode,
        Guid sizeId,
        string sizeName,
        string sizeCode,
        Guid? uploadedAssetId = null,
        string? uploadedAssetUrl = null,
        string? designNote = null,
        string? notes = null,
        decimal resolvedUnitPrintPrice = 8m,
        int? appliedPrintTierMinQuantity = 10,
        int sortOrder = 0)
        => new()
        {
            Id = printId,
            PrintAreaId = areaId,
            PrintAreaName = areaName,
            PrintAreaCode = areaCode,
            PrintAreaPrice = 0m,
            PrintSizeId = sizeId,
            PrintSizeName = sizeName,
            PrintSizeCode = sizeCode,
            PrintSizePrice = 10m,
            ResolvedUnitPrintPrice = resolvedUnitPrintPrice,
            AppliedPrintTierMinQuantity = appliedPrintTierMinQuantity,
            SortOrder = sortOrder,
            Notes = notes,
            UploadedAssetId = uploadedAssetId,
            UploadedAssetUrl = uploadedAssetUrl,
            DesignNote = designNote,
        };

    public static OrderItemDto Badge(
        Guid itemId,
        int quantity = 25,
        decimal unitPrice = 1.8m,
        Guid? uploadedAssetId = null,
        string? uploadedAssetUrl = "/uploads/designs/badge_20260701_abc123_club.png",
        string? designNote = "Club logo",
        int? appliedQuantityTierMinQuantity = 25,
        Guid? productId = null,
        string productName = "Round Badge 58mm")
        => new()
        {
            Id = itemId,
            ProductId = productId ?? BadgeProductId,
            ProductVariantId = null,
            ProductName = productName,
            VariantLabel = null,
            Quantity = quantity,
            UnitPrice = unitPrice,
            PricingModel = PricingModel.QuantityTierUnit,
            ProductKind = ProductKind.Badge,
            UploadedAssetId = uploadedAssetId ?? Id(700),
            UploadedAssetUrl = uploadedAssetUrl,
            DesignNote = designNote,
            AppliedQuantityTierMinQuantity = appliedQuantityTierMinQuantity,
        };

    public static OrderItemDto Banner(
        Guid itemId,
        int quantity = 2,
        decimal unitPrice = 180m,
        BannerDetailDto? detail = null,
        string? designNote = null,
        Guid? productId = null,
        string productName = "Pull-up Banner")
        => new()
        {
            Id = itemId,
            ProductId = productId ?? BannerProductId,
            ProductVariantId = null,
            ProductName = productName,
            VariantLabel = null,
            Quantity = quantity,
            UnitPrice = unitPrice,
            PricingModel = PricingModel.FixedSize,
            ProductKind = ProductKind.Banner,
            UploadedAssetId = Id(701),
            UploadedAssetUrl = "/uploads/designs/banner_20260701_def456_expo.png",
            DesignNote = designNote,
            BannerDetail = detail ?? PresetBannerDetail(),
        };

    public static BannerDetailDto PresetBannerDetail() => new()
    {
        SizeMode = BannerSizeMode.Preset,
        SizePresetId = Id(800),
        SizeLabel = "850 x 2000 mm",
        Material = BannerMaterial.PullUp,
        FinishingEyelets = false,
        FinishingHemming = false,
        FinishingPolePocket = false,
        StandIncluded = true,
        StandReplacementOnly = false,
    };

    public static BannerDetailDto CustomBannerDetail(decimal width = 1.2m, decimal height = 2.4m) => new()
    {
        SizeMode = BannerSizeMode.Custom,
        Width = width,
        Height = height,
        Unit = BannerDimensionUnit.M,
        AreaSquareMetres = width * height,
        Material = BannerMaterial.Mesh,
        MaterialDisplayName = null,
        FinishingEyelets = true,
        FinishingHemming = true,
        FinishingPolePocket = false,
        StandIncluded = false,
        StandReplacementOnly = false,
        Notes = "Reinforce corners.",
    };

    /// <summary>Garment + Badge + Banner, the widest shape the current production sheet renders.</summary>
    public static OrderDto MixedOrder() => Order(
        Garment(Id(10), "Black / M", quantity: 3),
        Garment(Id(11), "Black / L", quantity: 2),
        Garment(Id(12), "White / M", quantity: 4, prints: new[]
        {
            Print(Id(1001), FrontAreaId, "Front", "FRONT", A3SizeId, "A3", "A3"),
            Print(Id(1002), BackAreaId, "Back", "BACK", A4SizeId, "A4", "A4", sortOrder: 1),
        }),
        Garment(Id(13), "Navy / XL", quantity: 1, productId: TeeTwinProductId, productName: "Staple Tee",
            variantId: Id(501)),
        Badge(Id(14)),
        Banner(Id(15)));
}
