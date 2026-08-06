using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TeeNova.Portfolio.PrivateStorage;
using Volo.Abp;
using Volo.Abp.Application.Dtos;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Entities;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Portfolio;

public class PortfolioAppService : ApplicationService, IPortfolioAppService
{
    private readonly IRepository<PortfolioItem, Guid> _items;
    private readonly IRepository<PortfolioItemImage, Guid> _images;
    private readonly IPortfolioObjectStorage _storage;
    private readonly PortfolioImageProcessor _processor;
    private readonly PortfolioOptions _options;

    public PortfolioAppService(IRepository<PortfolioItem, Guid> items, IRepository<PortfolioItemImage, Guid> images,
        IPortfolioObjectStorage storage, PortfolioImageProcessor processor, IOptions<PortfolioOptions> options)
    { _items = items; _images = images; _storage = storage; _processor = processor; _options = options.Value; }

    public async Task<PagedResultDto<PortfolioItemDto>> GetPublishedAsync(GetPortfolioItemsInput input)
    {
        if (!_options.Enabled) return new(0, []);
        input.MaxResultCount = Math.Clamp(input.MaxResultCount, 1, 50);
        var query = (await _items.GetQueryableAsync()).AsNoTracking().Include(x => x.Images)
            .Where(x => x.Status == PortfolioStatus.Published);
        query = ApplyFilters(query, input);
        var count = await query.CountAsync();
        var rows = await query.OrderBy(x => x.SortOrder).ThenByDescending(x => x.PublishedAt)
            .Skip(input.SkipCount).Take(input.MaxResultCount).ToListAsync();
        return new(count, rows.Select(x => Map(x, false)).ToList());
    }

    public async Task<PortfolioItemDto> GetPublishedBySlugAsync(string slug)
    {
        EnsureEnabled();
        var query = await QueryWithImagesAsync();
        var item = await query.FirstOrDefaultAsync(x => x.Slug == slug && x.Status == PortfolioStatus.Published)
            ?? throw new EntityNotFoundException(typeof(PortfolioItem), slug);
        return Map(item, false);
    }

    public async Task<PagedResultDto<PortfolioItemDto>> GetAdminListAsync(GetPortfolioItemsInput input)
    {
        EnsureEnabled();
        input.MaxResultCount = Math.Clamp(input.MaxResultCount, 1, 100);
        var query = ApplyFilters((await _items.GetQueryableAsync()).AsNoTracking().Include(x => x.Images), input);
        var count = await query.CountAsync();
        var rows = await query.OrderByDescending(x => x.CreationTime).Skip(input.SkipCount).Take(input.MaxResultCount).ToListAsync();
        return new(count, rows.Select(x => Map(x, true)).ToList());
    }

    public async Task<PortfolioItemDto> GetAdminAsync(Guid id) => Map(await Find(id), true);

    public async Task<PortfolioItemDto> CreateAsync(CreatePortfolioItemDto input)
    {
        EnsureEnabled(); ValidateDraft(input.Title, input.Slug, input.ShortCaption);
        await EnsureUniqueSlug(input.Slug, null);
        var item = new PortfolioItem(GuidGenerator.Create());
        Apply(item, input);
        await _items.InsertAsync(item, autoSave: true);
        return Map(item, true);
    }

    public async Task<PortfolioItemDto> UpdateAsync(Guid id, UpdatePortfolioItemDto input)
    {
        EnsureEnabled(); ValidateDraft(input.Title, input.Slug, input.ShortCaption);
        var item = await Find(id);
        if (!string.Equals(item.ConcurrencyStamp, input.ConcurrencyStamp, StringComparison.Ordinal))
            throw new Volo.Abp.Data.AbpDbConcurrencyException("The portfolio item was changed by another user. Reload and try again.");
        await EnsureUniqueSlug(input.Slug, id);
        Apply(item, input);
        if (item.Status == PortfolioStatus.Published)
        {
            var errors = PortfolioPublicationValidator.Validate(item);
            if (errors.Count > 0) throw new UserFriendlyException(string.Join(" ", errors));
        }
        item.ConcurrencyStamp = Guid.NewGuid().ToString("N");
        await _items.UpdateAsync(item, autoSave: true);
        return Map(item, true);
    }

    public async Task<PortfolioImageDto> UploadImageAsync(Guid id, PortfolioImageUploadDto input, CancellationToken cancellationToken = default)
    {
        EnsureEnabled(); var item = await Find(id);
        if (item.Images.Count >= _options.MaximumImagesPerItem) throw new UserFriendlyException("This portfolio item has reached its image limit.");
        var processed = await _processor.ProcessAsync(input.File, cancellationToken);
        var key = Guid.NewGuid().ToString("N");
        await using var bytes = new MemoryStream(processed.Content, writable: false);
        await _storage.SaveAsync(key, bytes, cancellationToken);
        try
        {
            var image = new PortfolioItemImage(GuidGenerator.Create())
            {
                PortfolioItemId = id, ObjectKey = key, OriginalFileName = Path.GetFileName(input.File.FileName),
                ContentType = processed.ContentType, SizeBytes = processed.Content.LongLength, Sha256 = processed.Sha256,
                Width = processed.Width, Height = processed.Height, SortOrder = item.Images.Count,
            };
            await _images.InsertAsync(image, autoSave: true);
            return MapImage(image, item.Slug, true);
        }
        catch { await _storage.DeleteAsync(key, cancellationToken); throw; }
    }

    public async Task<PortfolioImageDto> UpdateImageAsync(Guid id, Guid imageId, UpdatePortfolioImageDto input)
    {
        EnsureEnabled(); var item = await Find(id);
        var image = item.Images.SingleOrDefault(x => x.Id == imageId) ?? throw new EntityNotFoundException(typeof(PortfolioItemImage), imageId);
        if (input.IsPrimary) foreach (var sibling in item.Images) sibling.IsPrimary = sibling.Id == imageId;
        else image.IsPrimary = false;
        image.AltText = input.AltText.Trim(); image.PermissionSource = input.PermissionSource;
        image.PermissionReference = input.PermissionReference.Trim(); image.SortOrder = input.SortOrder;
        if (item.Status == PortfolioStatus.Published)
        {
            var errors = PortfolioPublicationValidator.Validate(item);
            if (errors.Count > 0) throw new UserFriendlyException(string.Join(" ", errors));
        }
        await _items.UpdateAsync(item, autoSave: true);
        return MapImage(image, item.Slug, true);
    }

    public async Task DeleteImageAsync(Guid id, Guid imageId)
    {
        EnsureEnabled(); var item = await Find(id);
        var image = item.Images.SingleOrDefault(x => x.Id == imageId) ?? throw new EntityNotFoundException(typeof(PortfolioItemImage), imageId);
        if (item.Status == PortfolioStatus.Published) throw new UserFriendlyException("Unpublish the item before deleting an image.");
        await _storage.DeleteAsync(image.ObjectKey);
        await _images.DeleteAsync(image, autoSave: true);
    }

    public Task<PortfolioItemDto> PublishAsync(Guid id) => ChangeStatus(id, PortfolioStatus.Published);
    public Task<PortfolioItemDto> ArchiveAsync(Guid id) => ChangeStatus(id, PortfolioStatus.Archived);
    public Task<PortfolioItemDto> UnpublishAsync(Guid id) => ChangeStatus(id, PortfolioStatus.Draft);

    public async Task DeleteAsync(Guid id)
    {
        EnsureEnabled(); var item = await Find(id);
        if (item.Status == PortfolioStatus.Published) throw new UserFriendlyException("Unpublish the item before deleting it.");
        foreach (var image in item.Images) await _storage.DeleteAsync(image.ObjectKey);
        await _items.DeleteAsync(item, autoSave: true);
    }

    public async Task<PortfolioImageContent> OpenAdminImageAsync(Guid id, Guid imageId)
    { EnsureEnabled(); var item = await Find(id); return await Open(item, imageId); }

    public async Task<PortfolioImageContent> OpenPublishedImageAsync(string slug, Guid imageId)
    {
        EnsureEnabled();
        var query = (await QueryWithImagesAsync()).AsNoTracking();
        var item = await query.FirstOrDefaultAsync(x => x.Slug == slug && x.Status == PortfolioStatus.Published)
            ?? throw new EntityNotFoundException(typeof(PortfolioItem), slug);
        return await Open(item, imageId);
    }

    private async Task<PortfolioItemDto> ChangeStatus(Guid id, PortfolioStatus status)
    {
        EnsureEnabled(); var item = await Find(id);
        if (status == PortfolioStatus.Draft && item.Status != PortfolioStatus.Published)
            throw new UserFriendlyException("Only a published item can be unpublished.");
        if (status == PortfolioStatus.Published && item.Status == PortfolioStatus.Published)
            throw new UserFriendlyException("The portfolio item is already published.");
        if (status == PortfolioStatus.Published)
        {
            await EnsureUniqueSlug(item.Slug, item.Id);
            var errors = PortfolioPublicationValidator.Validate(item);
            if (errors.Count > 0) throw new UserFriendlyException(string.Join(" ", errors));
            item.PublishedAt = Clock.Now;
        }
        else item.PublishedAt = null;
        item.Status = status;
        await _items.UpdateAsync(item, autoSave: true);
        return Map(item, true);
    }

    private async Task<PortfolioImageContent> Open(PortfolioItem item, Guid imageId)
    {
        var image = item.Images.SingleOrDefault(x => x.Id == imageId) ?? throw new EntityNotFoundException(typeof(PortfolioItemImage), imageId);
        return new(await _storage.OpenReadAsync(image.ObjectKey), image.ContentType, image.Sha256, new DateTimeOffset(image.CreationTime, TimeSpan.Zero));
    }

    private async Task<PortfolioItem> Find(Guid id)
    {
        var query = await QueryWithImagesAsync();
        return await query.FirstOrDefaultAsync(x => x.Id == id)
            ?? throw new EntityNotFoundException(typeof(PortfolioItem), id);
    }
    private async Task<IQueryable<PortfolioItem>> QueryWithImagesAsync()
        => (await _items.GetQueryableAsync()).Include(x => x.Images);

    private static IQueryable<PortfolioItem> ApplyFilters(IQueryable<PortfolioItem> query, GetPortfolioItemsInput input)
    {
        if (input.Status.HasValue) query = query.Where(x => x.Status == input.Status);
        if (input.ServiceType.HasValue) query = query.Where(x => x.ServiceType == input.ServiceType);
        if (input.IsFeatured.HasValue) query = query.Where(x => x.IsFeatured == input.IsFeatured);
        if (!string.IsNullOrWhiteSpace(input.Search)) { var s = input.Search.Trim(); query = query.Where(x => x.Title.Contains(s) || x.ShortCaption.Contains(s)); }
        return query;
    }

    private async Task EnsureUniqueSlug(string slug, Guid? excludingId)
    {
        var query = await _items.GetQueryableAsync();
        if (await query.AnyAsync(x => x.Slug == slug && (!excludingId.HasValue || x.Id != excludingId.Value)))
            throw new UserFriendlyException("That portfolio slug is already in use.");
    }
    private void EnsureEnabled() { if (!_options.Enabled) throw new UserFriendlyException("Portfolio is disabled."); }
    private static void ValidateDraft(string title, string slug, string caption)
    {
        if (title.Trim().Length is < 1 or > 160 || slug.Trim().Length is < 1 or > 160 || caption.Trim().Length is < 1 or > 320)
            throw new UserFriendlyException("Title, slug and short caption are required and must fit their length limits.");
    }
    private static void Apply(PortfolioItem item, CreatePortfolioItemDto input)
    { item.Title = input.Title.Trim(); item.Slug = input.Slug.Trim(); item.ServiceType = input.ServiceType; item.ShortCaption = input.ShortCaption.Trim(); item.LongDescription = input.LongDescription?.Trim(); item.SortOrder = input.SortOrder; item.IsFeatured = input.IsFeatured; }

    private static PortfolioItemDto Map(PortfolioItem x, bool admin) => new()
    {
        Id=x.Id, Title=x.Title, Slug=x.Slug, ServiceType=x.ServiceType, ShortCaption=x.ShortCaption,
        LongDescription=x.LongDescription, Status=x.Status, SortOrder=x.SortOrder, IsFeatured=x.IsFeatured,
        PublishedAt=x.PublishedAt, CreationTime=x.CreationTime, LastModificationTime=x.LastModificationTime,
        ConcurrencyStamp=admin ? x.ConcurrencyStamp : null, Images=x.Images.OrderBy(i=>i.SortOrder).Select(i=>MapImage(i,x.Slug,admin)).ToList()
    };
    private static PortfolioImageDto MapImage(PortfolioItemImage x, string slug, bool admin) => new()
    { Id=x.Id, AltText=x.AltText, PermissionSource=x.PermissionSource, PermissionReference=admin?x.PermissionReference:null,
      OriginalFileName=admin?x.OriginalFileName:null, Width=x.Width, Height=x.Height, IsPrimary=x.IsPrimary, SortOrder=x.SortOrder,
      Url=admin?$"/api/portfolio/admin/items/{x.PortfolioItemId}/images/{x.Id}/content":$"/api/portfolio/items/{slug}/images/{x.Id}" };
}
