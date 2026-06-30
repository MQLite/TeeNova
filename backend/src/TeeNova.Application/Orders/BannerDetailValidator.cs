using System;
using TeeNova.Orders.Dtos;
using Volo.Abp;
using Volo.Abp.DependencyInjection;

namespace TeeNova.Orders;

/// <summary>
/// Normalized, server-trusted Banner configuration produced by <see cref="BannerDetailValidator"/>
/// (Jira 9511). <see cref="AreaSquareMetres"/> is computed here, never taken from the client. Carries
/// no price fields. Mapped onto an <c>OrderItemBannerDetail</c> entity when the order item is built.
/// </summary>
public sealed record BannerDetailSnapshot(
    BannerSizeMode SizeMode,
    Guid? SizePresetId,
    string? SizeLabel,
    decimal? Width,
    decimal? Height,
    BannerDimensionUnit? Unit,
    decimal? AreaSquareMetres,
    BannerMaterial Material,
    string? MaterialDisplayName,
    bool FinishingEyelets,
    bool FinishingHemming,
    bool FinishingPolePocket,
    string? FinishingOther,
    bool StandIncluded,
    bool StandReplacementOnly,
    string? Notes);

/// <summary>
/// Validates and normalizes Banner configuration input (Jira 9511) and computes the area server-side.
/// Stateless; the authoritative gate for Banner config — the client never supplies area or price.
/// </summary>
public class BannerDetailValidator : ITransientDependency
{
    private const int    MaxNotesLength = 2000;
    private const decimal MaxDimension  = 1_000_000m; // generous upper bound to reject garbage values

    /// <summary>
    /// Validates and normalizes the supplied input, returning a trusted snapshot. Throws a
    /// <see cref="BusinessException"/> with a specific code on any invalid/contradictory value.
    /// </summary>
    public BannerDetailSnapshot ValidateAndNormalize(BannerDetailInputDto? input)
    {
        if (input == null)
            throw new BusinessException("TeeNova:Banner:BannerDetailRequired");

        if (!Enum.IsDefined(typeof(BannerSizeMode), input.SizeMode))
            throw new BusinessException("TeeNova:Banner:InvalidBannerSizeMode")
                .WithData("SizeMode", input.SizeMode);

        if (!Enum.IsDefined(typeof(BannerMaterial), input.Material))
            throw new BusinessException("TeeNova:Banner:BannerMaterialRequired")
                .WithData("Material", input.Material);

        // Material=Other must carry a free-text label so production/admin know the substrate.
        var materialDisplayName = Clean(input.MaterialDisplayName);
        if (input.Material == BannerMaterial.Other && materialDisplayName == null)
            throw new BusinessException("TeeNova:Banner:BannerMaterialRequired")
                .WithData("Reason", "MaterialDisplayName is required when Material is Other");

        var sizeLabel = Clean(input.SizeLabel);
        var notes     = Clean(input.Notes);
        if (notes is { Length: > MaxNotesLength })
            throw new BusinessException("TeeNova:Banner:BannerNotesTooLong")
                .WithData("MaxLength", MaxNotesLength);

        var width  = input.Width;
        var height = input.Height;
        var unit   = input.Unit;

        // Unit, when supplied, must be a defined value.
        if (unit.HasValue && !Enum.IsDefined(typeof(BannerDimensionUnit), unit.Value))
            throw new BusinessException("TeeNova:Banner:InvalidBannerUnit")
                .WithData("Unit", unit.Value);

        if (input.SizeMode == BannerSizeMode.Custom)
        {
            if (width is not > 0m || height is not > 0m)
                throw new BusinessException("TeeNova:Banner:BannerDimensionsRequired")
                    .WithData("Reason", "Width and Height are required and must be > 0 for custom size");

            if (!unit.HasValue)
                throw new BusinessException("TeeNova:Banner:InvalidBannerUnit")
                    .WithData("Reason", "Unit is required for custom size");

            ValidateDimensionBounds(width!.Value, height!.Value);
        }
        else // Preset
        {
            if (input.SizePresetId == null && sizeLabel == null)
                throw new BusinessException("TeeNova:Banner:InvalidBannerPreset")
                    .WithData("Reason", "SizePresetId or SizeLabel is required for preset size");

            // Dimensions are optional snapshots for presets, but if any is supplied both + unit must be valid.
            var anyDimension = width.HasValue || height.HasValue;
            if (anyDimension)
            {
                if (width is not > 0m || height is not > 0m)
                    throw new BusinessException("TeeNova:Banner:InvalidBannerDimensions")
                        .WithData("Reason", "When supplied for a preset, Width and Height must both be > 0");

                if (!unit.HasValue)
                    throw new BusinessException("TeeNova:Banner:InvalidBannerUnit")
                        .WithData("Reason", "Unit is required when preset dimensions are supplied");

                ValidateDimensionBounds(width!.Value, height!.Value);
            }
        }

        var area = ComputeAreaSquareMetres(width, height, unit);

        return new BannerDetailSnapshot(
            SizeMode:             input.SizeMode,
            SizePresetId:         input.SizePresetId,
            SizeLabel:            sizeLabel,
            Width:                width,
            Height:               height,
            Unit:                 unit,
            AreaSquareMetres:     area,
            Material:             input.Material,
            MaterialDisplayName:  materialDisplayName,
            FinishingEyelets:     input.FinishingEyelets,
            FinishingHemming:     input.FinishingHemming,
            FinishingPolePocket:  input.FinishingPolePocket,
            FinishingOther:       Clean(input.FinishingOther),
            StandIncluded:        input.StandIncluded,
            StandReplacementOnly: input.StandReplacementOnly,
            Notes:                notes);
    }

    /// <summary>Computes area in m² when width, height and unit are all present; otherwise null.</summary>
    public static decimal? ComputeAreaSquareMetres(decimal? width, decimal? height, BannerDimensionUnit? unit)
    {
        if (width is not > 0m || height is not > 0m || unit == null)
            return null;

        var factor = unit.Value switch
        {
            BannerDimensionUnit.Mm => 0.001m,
            BannerDimensionUnit.Cm => 0.01m,
            BannerDimensionUnit.M  => 1m,
            _                      => throw new BusinessException("TeeNova:Banner:InvalidBannerUnit")
                                          .WithData("Unit", unit.Value),
        };

        var widthM  = width.Value  * factor;
        var heightM = height.Value * factor;
        return Math.Round(widthM * heightM, 4, MidpointRounding.AwayFromZero);
    }

    private static void ValidateDimensionBounds(decimal width, decimal height)
    {
        if (width > MaxDimension || height > MaxDimension)
            throw new BusinessException("TeeNova:Banner:InvalidBannerDimensions")
                .WithData("MaxDimension", MaxDimension);
    }

    private static string? Clean(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
