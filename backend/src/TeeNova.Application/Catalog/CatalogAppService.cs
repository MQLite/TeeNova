using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using TeeNova.Catalog.Dtos;
using TeeNova.Files;
using Volo.Abp;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Entities;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Catalog;

public class CatalogAppService : ApplicationService, ICatalogAppService
{
    private readonly IRepository<Product, Guid>        _productRepository;
    private readonly IRepository<ProductVariant, Guid> _variantRepository;
    private readonly IRepository<ProductImage, Guid>   _imageRepository;
    private readonly IFileStorageService               _fileStorageService;

    public CatalogAppService(
        IRepository<Product, Guid>        productRepository,
        IRepository<ProductVariant, Guid> variantRepository,
        IRepository<ProductImage, Guid>   imageRepository,
        IFileStorageService               fileStorageService)
    {
        _productRepository  = productRepository;
        _variantRepository  = variantRepository;
        _imageRepository    = imageRepository;
        _fileStorageService = fileStorageService;
    }

    public async Task<PagedResultDto<ProductListItemDto>> GetListAsync(GetProductsInput input)
    {
        var query = await _productRepository.GetQueryableAsync();

        query = query
            .Include(p => p.Images)
            .Include(p => p.Variants);

        if (input.IsActive.HasValue)
            query = query.Where(p => p.IsActive == input.IsActive.Value);

        if (!string.IsNullOrWhiteSpace(input.ProductType))
            query = query.Where(p => p.ProductType == input.ProductType);

        if (!string.IsNullOrWhiteSpace(input.Search))
            query = query.Where(p => p.Name.Contains(input.Search));

        var totalCount = await query.CountAsync();

        var items = await query
            .OrderBy(p => p.Name)
            .Skip(input.SkipCount)
            .Take(input.MaxResultCount)
            .ToListAsync();

        return new PagedResultDto<ProductListItemDto>(
            totalCount,
            ObjectMapper.Map<List<Product>, List<ProductListItemDto>>(items)
        );
    }

    public async Task<ProductDto> GetAsync(Guid id)
    {
        var query = await _productRepository.GetQueryableAsync();

        var product = await query
            .Include(p => p.Variants.OrderBy(v => v.SortOrder))
            .Include(p => p.Images)
            .FirstOrDefaultAsync(p => p.Id == id);

        if (product == null)
            throw new Volo.Abp.Domain.Entities.EntityNotFoundException(typeof(Product), id);

        return ObjectMapper.Map<Product, ProductDto>(product);
    }

    // ── Admin: Products ───────────────────────────────────────────────────────

    public async Task<ProductDto> CreateAsync(CreateProductDto input)
    {
        var product = new Product(GuidGenerator.Create(), input.Name, input.BasePrice, input.ProductType)
        {
            Description = input.Description,
            IsActive = input.IsActive,
        };

        await _productRepository.InsertAsync(product, autoSave: true);
        return await GetAsync(product.Id);
    }

    public async Task<ProductDto> UpdateAsync(Guid id, UpdateProductDto input)
    {
        var product = await _productRepository.GetAsync(id);
        product.Name = input.Name;
        product.Description = input.Description;
        product.BasePrice = input.BasePrice;
        product.ProductType = input.ProductType;
        product.IsActive = input.IsActive;
        await _productRepository.UpdateAsync(product, autoSave: true);
        return await GetAsync(id);
    }

    public async Task<ProductDto> UpdateStatusAsync(Guid id, UpdateProductStatusDto input)
    {
        var product = await _productRepository.GetAsync(id);
        product.IsActive = input.IsActive;
        await _productRepository.UpdateAsync(product, autoSave: true);
        return await GetAsync(id);
    }

    public Task DeleteAsync(Guid id)
        => throw new NotImplementedException("CatalogAppService.DeleteAsync is not yet implemented.");

    // ── Admin: Images ─────────────────────────────────────────────────────────

    private static readonly string[] AllowedImageContentTypes =
        { "image/jpeg", "image/png", "image/webp" };

    private static readonly string[] AllowedImageExtensions =
        { ".jpg", ".jpeg", ".png", ".webp" };

    public async Task<ProductImageDto> UploadProductImageAsync(
        Guid productId,
        IFormFile file,
        CancellationToken cancellationToken = default)
    {
        // Validate product exists
        if (!await _productRepository.AnyAsync(p => p.Id == productId, cancellationToken))
            throw new EntityNotFoundException(typeof(Product), productId);

        // Validate file presence
        if (file == null || file.Length == 0)
            throw new UserFriendlyException("No file was provided or the file is empty.");

        // Validate content type
        if (!AllowedImageContentTypes.Contains(file.ContentType, StringComparer.OrdinalIgnoreCase))
            throw new UserFriendlyException(
                $"Unsupported file type '{file.ContentType}'. Allowed types: JPEG, PNG, WebP.");

        // Validate extension
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (!AllowedImageExtensions.Contains(ext))
            throw new UserFriendlyException(
                $"Unsupported file extension '{ext}'. Allowed extensions: .jpg, .jpeg, .png, .webp.");

        // Persist file to the "products" folder
        string fileUrl;
        using (var stream = file.OpenReadStream())
        {
            fileUrl = await _fileStorageService.SaveAsync(
                stream,
                file.FileName,
                file.ContentType,
                folder: "products",
                fileNamePrefix: "product",
                cancellationToken: cancellationToken);
        }

        // Determine position within existing images for this product
        var existingCount = await _imageRepository.CountAsync(
            i => i.ProductId == productId, cancellationToken);

        var image = new ProductImage(
            GuidGenerator.Create(),
            productId,
            fileUrl,
            isPrimary: existingCount == 0)
        {
            SortOrder = existingCount,
        };

        await _imageRepository.InsertAsync(image, autoSave: true);
        return ObjectMapper.Map<ProductImage, ProductImageDto>(image);
    }

    public async Task<ProductImageDto> UpdateProductImageAsync(Guid productId, Guid imageId, UpdateProductImageDto input)
    {
        var image = await _imageRepository.GetAsync(imageId);

        if (image.ProductId != productId)
            throw new EntityNotFoundException(typeof(ProductImage), imageId);

        image.Color = string.IsNullOrWhiteSpace(input.Color) ? null : input.Color.Trim();
        await _imageRepository.UpdateAsync(image, autoSave: true);
        return ObjectMapper.Map<ProductImage, ProductImageDto>(image);
    }

    public async Task SetPrimaryProductImageAsync(Guid productId, Guid imageId)
    {
        var image = await _imageRepository.GetAsync(imageId);

        if (image.ProductId != productId)
            throw new EntityNotFoundException(typeof(ProductImage), imageId);

        var allImages = await _imageRepository.GetListAsync(i => i.ProductId == productId);
        for (var i = 0; i < allImages.Count; i++)
        {
            allImages[i].IsPrimary = allImages[i].Id == imageId;
            await _imageRepository.UpdateAsync(allImages[i], autoSave: i == allImages.Count - 1);
        }
    }

    public async Task DeleteProductImageAsync(Guid productId, Guid imageId)
    {
        var image = await _imageRepository.GetAsync(imageId);

        if (image.ProductId != productId)
            throw new EntityNotFoundException(typeof(ProductImage), imageId);

        var wasPrimary = image.IsPrimary;
        await _imageRepository.DeleteAsync(image, autoSave: true);

        if (wasPrimary)
        {
            var remaining = await _imageRepository.GetListAsync(i => i.ProductId == productId);
            var successor = remaining.OrderBy(i => i.SortOrder).FirstOrDefault();
            if (successor != null)
            {
                successor.IsPrimary = true;
                await _imageRepository.UpdateAsync(successor, autoSave: true);
            }
        }
    }

    // ── Admin: Variants ───────────────────────────────────────────────────────

    public async Task<ProductVariantDto> CreateVariantAsync(Guid productId, CreateProductVariantDto input)
    {
        // Validate product exists
        if (!await _productRepository.AnyAsync(p => p.Id == productId))
            throw new EntityNotFoundException(typeof(Product), productId);

        // Prevent duplicate size/color combination under the same product
        var duplicateExists = await _variantRepository.AnyAsync(
            v => v.ProductId == productId &&
                 v.Size  == input.Size  &&
                 v.Color == input.Color);

        if (duplicateExists)
            throw new UserFriendlyException(
                $"A variant with size '{input.Size}' and color '{input.Color}' already exists for this product.");

        var variant = new ProductVariant(GuidGenerator.Create(), productId, input.Sku, input.Color, input.Size)
        {
            PriceAdjustment = input.PriceAdjustment,
            StockQuantity   = input.StockQuantity,
            IsAvailable     = input.IsAvailable,
        };

        await _variantRepository.InsertAsync(variant, autoSave: true);
        return ObjectMapper.Map<ProductVariant, ProductVariantDto>(variant);
    }

    public async Task<ProductVariantDto> UpdateVariantAsync(Guid productId, Guid variantId, UpdateProductVariantDto input)
    {
        var variant = await _variantRepository.GetAsync(variantId);

        if (variant.ProductId != productId)
            throw new EntityNotFoundException(typeof(ProductVariant), variantId);

        // Prevent duplicate size/color — exclude the variant being updated
        var duplicateExists = await _variantRepository.AnyAsync(
            v => v.ProductId == productId &&
                 v.Size  == input.Size  &&
                 v.Color == input.Color &&
                 v.Id    != variantId);

        if (duplicateExists)
            throw new UserFriendlyException(
                $"A variant with size '{input.Size}' and color '{input.Color}' already exists for this product.");

        variant.Sku             = input.Sku;
        variant.Color           = input.Color;
        variant.Size            = input.Size;
        variant.PriceAdjustment = input.PriceAdjustment;
        variant.StockQuantity   = input.StockQuantity;
        variant.IsAvailable     = input.IsAvailable;

        await _variantRepository.UpdateAsync(variant, autoSave: true);
        return ObjectMapper.Map<ProductVariant, ProductVariantDto>(variant);
    }

    public async Task DeleteVariantAsync(Guid productId, Guid variantId)
    {
        var variant = await _variantRepository.GetAsync(variantId);

        if (variant.ProductId != productId)
            throw new EntityNotFoundException(typeof(ProductVariant), variantId);

        await _variantRepository.DeleteAsync(variant, autoSave: true);
    }

    public Task<ProductVariantDto> UpdateStockAsync(Guid productId, Guid variantId, UpdateStockDto input)
        => throw new NotImplementedException("CatalogAppService.UpdateStockAsync is not yet implemented.");

    public async Task<List<ProductVariantDto>> BulkSaveVariantsAsync(
        Guid productId, BulkSaveProductVariantsDto input)
    {
        // Validate product exists
        if (!await _productRepository.AnyAsync(p => p.Id == productId))
            throw new EntityNotFoundException(typeof(Product), productId);

        // Detect duplicate size/color pairs within the payload
        var seenPairs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var item in input.Variants)
        {
            var pairKey = $"{item.Size.Trim()}|{item.Color.Trim()}";
            if (!seenPairs.Add(pairKey))
                throw new UserFriendlyException(
                    $"Duplicate size/color combination in request: '{item.Size.Trim()}' / '{item.Color.Trim()}'.");
        }

        // Collect IDs of existing variants explicitly kept in the new matrix
        var submittedIds = input.Variants
            .Where(v => v.Id.HasValue)
            .Select(v => v.Id!.Value)
            .ToList();

        // Load variants that are no longer in the matrix so we can delete them after the upsert
        var variantsToDelete = await _variantRepository.GetListAsync(
            v => v.ProductId == productId && !submittedIds.Contains(v.Id));

        // Process each item — all within the ABP unit of work (transaction)
        for (var index = 0; index < input.Variants.Count; index++)
        {
            var item = input.Variants[index];

            if (item.Id.HasValue)
            {
                // Update existing variant
                var variant = await _variantRepository.GetAsync(item.Id.Value);

                if (variant.ProductId != productId)
                    throw new EntityNotFoundException(typeof(ProductVariant), item.Id.Value);

                // Only run duplicate check when size or color has changed
                var sizeChanged  = !string.Equals(variant.Size,  item.Size,  StringComparison.Ordinal);
                var colorChanged = !string.Equals(variant.Color, item.Color, StringComparison.Ordinal);
                if (sizeChanged || colorChanged)
                {
                    var conflict = await _variantRepository.AnyAsync(
                        v => v.ProductId == productId &&
                             v.Size      == item.Size  &&
                             v.Color     == item.Color &&
                             v.Id        != item.Id.Value);
                    if (conflict)
                        throw new UserFriendlyException(
                            $"A variant with size '{item.Size}' and color '{item.Color}' already exists for this product.");
                }

                variant.Sku             = item.Sku;
                variant.Color           = item.Color;
                variant.Size            = item.Size;
                variant.PriceAdjustment = item.PriceAdjustment;
                variant.StockQuantity   = item.StockQuantity;
                variant.IsAvailable     = item.IsAvailable;
                variant.SortOrder       = index;

                await _variantRepository.UpdateAsync(variant, autoSave: true);
            }
            else
            {
                // Create new variant — check no existing size/color for this product
                var duplicateExists = await _variantRepository.AnyAsync(
                    v => v.ProductId == productId &&
                         v.Size      == item.Size  &&
                         v.Color     == item.Color);

                if (duplicateExists)
                    throw new UserFriendlyException(
                        $"A variant with size '{item.Size}' and color '{item.Color}' already exists for this product.");

                var variant = new ProductVariant(
                    GuidGenerator.Create(), productId, item.Sku, item.Color, item.Size)
                {
                    PriceAdjustment = item.PriceAdjustment,
                    StockQuantity   = item.StockQuantity,
                    IsAvailable     = item.IsAvailable,
                    SortOrder       = index,
                };

                await _variantRepository.InsertAsync(variant, autoSave: true);
            }
        }

        // Delete variants that were removed from the regenerated matrix
        foreach (var obsolete in variantsToDelete)
            await _variantRepository.DeleteAsync(obsolete, autoSave: true);

        // Return the full current variant list in admin-defined order
        var allVariants = (await _variantRepository.GetListAsync(v => v.ProductId == productId))
            .OrderBy(v => v.SortOrder)
            .ToList();
        return ObjectMapper.Map<List<ProductVariant>, List<ProductVariantDto>>(allVariants);
    }
}
