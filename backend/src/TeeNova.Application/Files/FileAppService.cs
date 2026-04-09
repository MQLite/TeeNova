using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using TeeNova.Customization;
using TeeNova.Files.Dtos;
using Volo.Abp;
using Volo.Abp.Application.Services;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Files;

public class FileAppService : ApplicationService, IFileAppService
{
    private static readonly string[] AllowedContentTypes =
    {
        "image/png",
        "image/jpeg",
        "image/svg+xml",
        "image/webp",
        "application/pdf",
        "application/illustrator",
        "application/postscript",   // .ai files sometimes reported as this
    };

    private static readonly string[] AllowedExtensions =
    {
        ".png", ".jpg", ".jpeg", ".svg", ".webp", ".pdf", ".ai",
    };
    private const long MaxFileSizeBytes = 10 * 1024 * 1024; // 10 MB

    private readonly IFileStorageService _storageService;
    private readonly IRepository<UploadedAsset, Guid> _assetRepository;

    public FileAppService(
        IFileStorageService storageService,
        IRepository<UploadedAsset, Guid> assetRepository)
    {
        _storageService = storageService;
        _assetRepository = assetRepository;
    }

    public async Task<UploadFileOutput> UploadAsync(IFormFile file, CancellationToken cancellationToken = default)
    {
        if (file == null || file.Length == 0)
            throw new UserFriendlyException("No file provided.");

        if (file.Length > MaxFileSizeBytes)
            throw new UserFriendlyException($"File size exceeds the {MaxFileSizeBytes / (1024 * 1024)} MB limit.");

        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        var contentTypeAllowed = Array.Exists(AllowedContentTypes, ct => ct == file.ContentType);
        var extensionAllowed = Array.Exists(AllowedExtensions, e => e == ext);

        if (!contentTypeAllowed && !extensionAllowed)
            throw new UserFriendlyException("Only PNG, JPEG, SVG, WebP, PDF, and AI files are accepted.");

        await using var stream = file.OpenReadStream();
        var fileUrl = await _storageService.SaveAsync(stream, file.FileName, file.ContentType, cancellationToken);

        var asset = new UploadedAsset(
            GuidGenerator.Create(),
            file.FileName,
            fileUrl,
            file.ContentType,
            file.Length
        );

        await _assetRepository.InsertAsync(asset, autoSave: true);

        return new UploadFileOutput
        {
            AssetId = asset.Id,
            FileUrl = fileUrl,
            OriginalFileName = file.FileName,
            FileSizeBytes = file.Length
        };
    }
}
