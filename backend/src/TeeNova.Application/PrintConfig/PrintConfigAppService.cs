using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TeeNova.PrintConfig.Dtos;
using Volo.Abp;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Entities;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.PrintConfig;

public class PrintConfigAppService : ApplicationService, IPrintConfigAppService
{
    private readonly IRepository<PrintArea, Guid>           _areaRepository;
    private readonly IRepository<PrintSize, Guid>           _sizeRepository;
    private readonly IRepository<PrintAreaSizeOption, Guid> _optionRepository;

    public PrintConfigAppService(
        IRepository<PrintArea, Guid>           areaRepository,
        IRepository<PrintSize, Guid>           sizeRepository,
        IRepository<PrintAreaSizeOption, Guid> optionRepository)
    {
        _areaRepository   = areaRepository;
        _sizeRepository   = sizeRepository;
        _optionRepository = optionRepository;
    }

    // ── PrintArea ──────────────────────────────────────────────────────────────

    public async Task<List<PrintAreaDto>> GetAreasAsync(bool? isActive = true)
    {
        var query = await _areaRepository.GetQueryableAsync();

        if (isActive.HasValue)
            query = query.Where(a => a.IsActive == isActive.Value);

        var items = await query
            .OrderBy(a => a.SortOrder)
            .ThenBy(a => a.Name)
            .ToListAsync();

        return ObjectMapper.Map<List<PrintArea>, List<PrintAreaDto>>(items);
    }

    public async Task<PrintAreaDto> GetAreaAsync(Guid id)
    {
        var area = await _areaRepository.GetAsync(id);
        return ObjectMapper.Map<PrintArea, PrintAreaDto>(area);
    }

    public async Task<PrintAreaDto> CreateAreaAsync(CreateUpdatePrintAreaDto input)
    {
        var code = input.Code.Trim();

        if (await _areaRepository.AnyAsync(a => a.Code == code))
            throw new UserFriendlyException($"A print area with code '{code}' already exists.");

        if (input.LegacyPositionValue.HasValue &&
            await _areaRepository.AnyAsync(a => a.LegacyPositionValue == input.LegacyPositionValue.Value))
            throw new UserFriendlyException(
                $"A print area with legacy position value {input.LegacyPositionValue.Value} already exists.");

        var area = new PrintArea(GuidGenerator.Create(), input.Name.Trim(), code)
        {
            BasePrice           = input.BasePrice,
            IsActive            = input.IsActive,
            SortOrder           = input.SortOrder,
            LegacyPositionValue = input.LegacyPositionValue,
        };

        await _areaRepository.InsertAsync(area, autoSave: true);
        return ObjectMapper.Map<PrintArea, PrintAreaDto>(area);
    }

    public async Task<PrintAreaDto> UpdateAreaAsync(Guid id, CreateUpdatePrintAreaDto input)
    {
        var area = await _areaRepository.GetAsync(id);
        var code = input.Code.Trim();

        if (await _areaRepository.AnyAsync(a => a.Code == code && a.Id != id))
            throw new UserFriendlyException($"A print area with code '{code}' already exists.");

        if (input.LegacyPositionValue.HasValue &&
            await _areaRepository.AnyAsync(
                a => a.LegacyPositionValue == input.LegacyPositionValue.Value && a.Id != id))
            throw new UserFriendlyException(
                $"A print area with legacy position value {input.LegacyPositionValue.Value} already exists.");

        area.Name               = input.Name.Trim();
        area.Code               = code;
        area.BasePrice          = input.BasePrice;
        area.IsActive           = input.IsActive;
        area.SortOrder          = input.SortOrder;
        area.LegacyPositionValue = input.LegacyPositionValue;

        await _areaRepository.UpdateAsync(area, autoSave: true);
        return ObjectMapper.Map<PrintArea, PrintAreaDto>(area);
    }

    public async Task DeleteAreaAsync(Guid id)
    {
        var area = await _areaRepository.GetAsync(id);
        area.IsActive = false;
        await _areaRepository.UpdateAsync(area, autoSave: true);
    }

    // ── PrintSize ──────────────────────────────────────────────────────────────

    public async Task<List<PrintSizeDto>> GetSizesAsync(bool? isActive = true)
    {
        var query = await _sizeRepository.GetQueryableAsync();

        if (isActive.HasValue)
            query = query.Where(s => s.IsActive == isActive.Value);

        var items = await query
            .OrderBy(s => s.SortOrder)
            .ThenBy(s => s.Name)
            .ToListAsync();

        return ObjectMapper.Map<List<PrintSize>, List<PrintSizeDto>>(items);
    }

    public async Task<PrintSizeDto> GetSizeAsync(Guid id)
    {
        var size = await _sizeRepository.GetAsync(id);
        return ObjectMapper.Map<PrintSize, PrintSizeDto>(size);
    }

    public async Task<PrintSizeDto> CreateSizeAsync(CreateUpdatePrintSizeDto input)
    {
        var code = input.Code.Trim();

        if (await _sizeRepository.AnyAsync(s => s.Code == code))
            throw new UserFriendlyException($"A print size with code '{code}' already exists.");

        var size = new PrintSize(GuidGenerator.Create(), input.Name.Trim(), code)
        {
            BasePrice = input.BasePrice,
            IsActive  = input.IsActive,
            SortOrder = input.SortOrder,
        };

        await _sizeRepository.InsertAsync(size, autoSave: true);
        return ObjectMapper.Map<PrintSize, PrintSizeDto>(size);
    }

    public async Task<PrintSizeDto> UpdateSizeAsync(Guid id, CreateUpdatePrintSizeDto input)
    {
        var size = await _sizeRepository.GetAsync(id);
        var code = input.Code.Trim();

        if (await _sizeRepository.AnyAsync(s => s.Code == code && s.Id != id))
            throw new UserFriendlyException($"A print size with code '{code}' already exists.");

        size.Name      = input.Name.Trim();
        size.Code      = code;
        size.BasePrice = input.BasePrice;
        size.IsActive  = input.IsActive;
        size.SortOrder = input.SortOrder;

        await _sizeRepository.UpdateAsync(size, autoSave: true);
        return ObjectMapper.Map<PrintSize, PrintSizeDto>(size);
    }

    public async Task DeleteSizeAsync(Guid id)
    {
        var size = await _sizeRepository.GetAsync(id);
        size.IsActive = false;
        await _sizeRepository.UpdateAsync(size, autoSave: true);
    }

    // ── PrintAreaSizeOption ────────────────────────────────────────────────────

    public async Task<List<PrintAreaSizeOptionDto>> GetAreaSizesAsync(Guid areaId, bool includeInactive = false)
    {
        var area = await _areaRepository.GetAsync(areaId);

        var optionQuery = await _optionRepository.GetQueryableAsync();
        var sizeQuery   = await _sizeRepository.GetQueryableAsync();

        var joined = optionQuery
            .Where(o => o.PrintAreaId == areaId)
            .Join(sizeQuery, o => o.PrintSizeId, s => s.Id, (o, s) => new { Option = o, Size = s });

        if (!includeInactive)
        {
            if (!area.IsActive)
                return [];

            joined = joined.Where(x => x.Option.IsActive && x.Size.IsActive);
        }

        var rows = await joined
            .OrderBy(x => x.Option.SortOrder)
            .ThenBy(x => x.Size.Name)
            .ToListAsync();

        return rows.Select(x =>
        {
            var dto = ObjectMapper.Map<PrintAreaSizeOption, PrintAreaSizeOptionDto>(x.Option);
            dto.PrintSize = ObjectMapper.Map<PrintSize, PrintSizeDto>(x.Size);
            return dto;
        }).ToList();
    }

    public async Task<List<PrintAreaSizeOptionDto>> SetAreaSizesAsync(Guid areaId, List<SetPrintAreaSizeOptionInput> input)
    {
        var area = await _areaRepository.GetAsync(areaId);

        if (!area.IsActive)
            throw new UserFriendlyException("Cannot update allowed sizes for an inactive print area.");

        // Reject duplicate PrintSizeId values in the input
        var duplicates = input.GroupBy(x => x.PrintSizeId).Where(g => g.Count() > 1).Select(g => g.Key).ToList();
        if (duplicates.Any())
            throw new UserFriendlyException("Duplicate PrintSizeId values found in the input list.");

        // Validate all referenced PrintSizes exist; enforce active constraint
        var sizeIds  = input.Select(x => x.PrintSizeId).Distinct().ToList();
        var sizeQuery = await _sizeRepository.GetQueryableAsync();
        var sizes     = await sizeQuery.Where(s => sizeIds.Contains(s.Id)).ToListAsync();

        foreach (var item in input)
        {
            var size = sizes.FirstOrDefault(s => s.Id == item.PrintSizeId)
                ?? throw new EntityNotFoundException(typeof(PrintSize), item.PrintSizeId);

            if (item.IsActive && !size.IsActive)
                throw new UserFriendlyException(
                    $"Cannot add '{size.Name}' as an active option because the print size is inactive.");
        }

        // Load existing options for this area
        var optionQuery = await _optionRepository.GetQueryableAsync();
        var existing    = await optionQuery.Where(o => o.PrintAreaId == areaId).ToListAsync();

        var inputBySize = input.ToDictionary(x => x.PrintSizeId);

        // Update or insert
        foreach (var item in input)
        {
            var row = existing.FirstOrDefault(o => o.PrintSizeId == item.PrintSizeId);
            if (row is not null)
            {
                row.IsActive  = item.IsActive;
                row.SortOrder = item.SortOrder;
                await _optionRepository.UpdateAsync(row);
            }
            else
            {
                var newOption = new PrintAreaSizeOption(GuidGenerator.Create(), areaId, item.PrintSizeId)
                {
                    IsActive  = item.IsActive,
                    SortOrder = item.SortOrder,
                };
                await _optionRepository.InsertAsync(newOption);
            }
        }

        // Soft-deactivate options not included in input
        foreach (var row in existing.Where(o => !inputBySize.ContainsKey(o.PrintSizeId)))
        {
            if (row.IsActive)
            {
                row.IsActive = false;
                await _optionRepository.UpdateAsync(row);
            }
        }

        await CurrentUnitOfWork!.SaveChangesAsync();

        // Return all options (including newly inactive) so admin sees full state
        return await GetAreaSizesAsync(areaId, includeInactive: true);
    }
}
