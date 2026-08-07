using TeeNova.Enquiries;
using TeeNova.Portfolio;

namespace TeeNova.Application.Tests.Portfolio;

public class PortfolioPublicationValidatorTests
{
    [Fact]
    public void New_item_defaults_to_draft(){Assert.Equal(PortfolioStatus.Draft,new PortfolioItem(Guid.NewGuid()).Status);}
    [Fact]
    public void New_image_defaults_required_draft_metadata_to_empty_strings()
    {
        var image = new PortfolioItemImage(Guid.NewGuid());
        Assert.Equal(string.Empty, image.AltText);
        Assert.Equal(string.Empty, image.PermissionReference);
    }
    [Fact]
    public void Valid_item_passes_all_publication_invariants()
    {
        var item = Valid();
        Assert.Empty(PortfolioPublicationValidator.Validate(item));
    }

    [Fact]
    public void Missing_image_primary_alt_and_permission_are_rejected()
    {
        var item=Valid(); item.Images.Clear();
        var errors=PortfolioPublicationValidator.Validate(item);
        Assert.Contains(errors,x=>x.Contains("At least one")); Assert.Contains(errors,x=>x.Contains("Exactly one"));
        item.Images.Add(new PortfolioItemImage(Guid.NewGuid()));
        errors=PortfolioPublicationValidator.Validate(item);
        Assert.Contains(errors,x=>x.Contains("alt text")); Assert.Contains(errors,x=>x.Contains("permission reference"));
    }

    [Theory]
    [InlineData("Bad Slug")][InlineData("bad--slug")][InlineData("bad_slug")][InlineData("-bad")]
    public void Unsafe_slug_is_rejected(string slug){var item=Valid();item.Slug=slug;Assert.Contains(PortfolioPublicationValidator.Validate(item),x=>x.Contains("Slug"));}

    [Theory]
    [InlineData("TODO replace")][InlineData("placeholder photo")][InlineData("C:\\Users\\staff\\photo.jpg")][InlineData("/Users/staff/photo.jpg")]
    public void Placeholders_and_internal_paths_are_rejected(string value){var item=Valid();item.LongDescription=value;Assert.Contains(PortfolioPublicationValidator.Validate(item),x=>x.Contains("Placeholder"));}

    [Fact]
    public void Multiple_primary_images_are_rejected(){var item=Valid();item.Images.Add(Image(true));Assert.Contains(PortfolioPublicationValidator.Validate(item),x=>x.Contains("Exactly one"));}

    private static PortfolioItem Valid(){var item=new PortfolioItem(Guid.NewGuid()){Title="Approved garment print",Slug="approved-garment-print",ServiceType=QuoteServiceType.GarmentPrinting,ShortCaption="A completed print job."};item.Images.Add(Image(true));return item;}
    private static PortfolioItemImage Image(bool primary)=>new(Guid.NewGuid()){AltText="Printed navy shirt on a table",PermissionSource=PortfolioPermissionSource.BusinessOwned,PermissionReference="Owner photo 2026-08-05",IsPrimary=primary,ObjectKey=Guid.NewGuid().ToString("N"),OriginalFileName="photo.jpg",ContentType="image/jpeg",Sha256=new string('a',64)};
}
