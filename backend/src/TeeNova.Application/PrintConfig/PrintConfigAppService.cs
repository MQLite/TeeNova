using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using TeeNova.PrintConfig.Dtos;
using Volo.Abp;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.PrintConfig;

public class PrintConfigAppService : ApplicationService, IPrintConfigAppService
{
    private readonly IRepository<PrintArea, Guid> _areaRepository;
    private readonly IRepository<PrintSize, Guid> _sizeRepository;

    public PrintConfigAppService(
        IRepository<PrintArea, Guid> areaRepository,
        IRepository<PrintSize, Guid> sizeRepository)
    {
        _areaRepository = areaRepository;
        _sizeRepository = sizeRepository;
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
}
