using System.Text.RegularExpressions;

namespace TeeNova.Portfolio;

public static partial class PortfolioPublicationValidator
{
    public static IReadOnlyList<string> Validate(PortfolioItem item)
    {
        var errors = new List<string>();
        if (string.IsNullOrWhiteSpace(item.Title)) errors.Add("Title is required.");
        if (string.IsNullOrWhiteSpace(item.ShortCaption)) errors.Add("Short caption is required.");
        if (!SlugPattern().IsMatch(item.Slug ?? "")) errors.Add("Slug must contain lowercase letters, numbers and single hyphens only.");
        if (LooksLikePlaceholder(item.Title) || LooksLikePlaceholder(item.ShortCaption) || LooksLikePlaceholder(item.LongDescription))
            errors.Add("Placeholder or internal-path content cannot be published.");
        if (item.Images.Count == 0) errors.Add("At least one image is required.");
        if (item.Images.Count(i => i.IsPrimary) != 1) errors.Add("Exactly one primary image is required.");
        foreach (var image in item.Images)
        {
            if (string.IsNullOrWhiteSpace(image.AltText)) errors.Add("Every image requires alt text.");
            if (string.IsNullOrWhiteSpace(image.PermissionReference)) errors.Add("Every image requires a permission reference.");
        }
        return errors.Distinct().ToList();
    }

    private static bool LooksLikePlaceholder(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        var text = value.ToLowerInvariant();
        return text.Contains("lorem ipsum") || text.Contains("placeholder") || text.Contains("todo")
            || text.Contains("c:\\") || text.Contains("/users/") || text.Contains("app_data/") || text.Contains("wwwroot/");
    }

    [GeneratedRegex("^[a-z0-9]+(?:-[a-z0-9]+)*$", RegexOptions.CultureInvariant)]
    private static partial Regex SlugPattern();
}

