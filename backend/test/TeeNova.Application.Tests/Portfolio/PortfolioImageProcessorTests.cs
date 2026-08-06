using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Options;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using SixLabors.ImageSharp.PixelFormats;
using TeeNova.Portfolio;
using Volo.Abp;

namespace TeeNova.Application.Tests.Portfolio;

public class PortfolioImageProcessorTests
{
    [Fact]
    public async Task Reencodes_valid_image_and_strips_exif()
    {
        using var image=new Image<Rgba32>(20,10); image.Metadata.ExifProfile=new ExifProfile(); image.Metadata.ExifProfile.SetValue(ExifTag.Artist,"Private photographer");
        await using var source=new MemoryStream(); await image.SaveAsync(source,new JpegEncoder());
        var result=await Processor().ProcessAsync(Form(source.ToArray(),"photo.jpg","image/jpeg"),default);
        Assert.Equal("image/jpeg",result.ContentType); Assert.Equal(20,result.Width); Assert.Equal(10,result.Height); Assert.Equal(64,result.Sha256.Length);
        using var clean=Image.Load(result.Content); Assert.Null(clean.Metadata.ExifProfile);
    }

    [Fact]
    public async Task Signature_not_extension_controls_type(){var bytes=await Png();var result=await Processor().ProcessAsync(Form(bytes,"misnamed.jpg","image/jpeg"),default);Assert.Equal("image/png",result.ContentType);}
    [Fact]
    public async Task Accepts_and_reencodes_webp(){using var image=new Image<Rgba32>(3,4);await using var ms=new MemoryStream();await image.SaveAsync(ms,new WebpEncoder());var result=await Processor().ProcessAsync(Form(ms.ToArray(),"x.webp","image/webp"),default);Assert.Equal("image/webp",result.ContentType);Assert.Equal(3,result.Width);Assert.Equal(4,result.Height);}
    [Fact]
    public async Task Svg_and_malformed_content_are_rejected(){await Assert.ThrowsAsync<UserFriendlyException>(()=>Processor().ProcessAsync(Form("<svg/>"u8.ToArray(),"x.svg","image/svg+xml"),default));}
    [Fact]
    public async Task Oversized_declared_upload_is_rejected(){var file=new FormFile(new MemoryStream([1]),0,11,"file","x.jpg");await Assert.ThrowsAsync<UserFriendlyException>(()=>Processor(10).ProcessAsync(file,default));}
    [Fact]
    public async Task Pixel_bomb_dimensions_are_rejected_before_decode(){var bytes=await Png(20,20);await Assert.ThrowsAsync<UserFriendlyException>(()=>Processor(maxPixels:100).ProcessAsync(Form(bytes,"x.png","image/png"),default));}

    private static PortfolioImageProcessor Processor(long maxBytes=100000,long maxPixels=100000)=>new(Options.Create(new PortfolioOptions{Enabled=true,MaximumUploadBytes=maxBytes,MaximumPixels=maxPixels}));
    private static FormFile Form(byte[] bytes,string name,string type){var file=new FormFile(new MemoryStream(bytes),0,bytes.Length,"file",name);file.Headers=new HeaderDictionary();file.ContentType=type;return file;}
    private static async Task<byte[]> Png(int width=2,int height=2){using var image=new Image<Rgba32>(width,height);await using var ms=new MemoryStream();await image.SaveAsPngAsync(ms);return ms.ToArray();}
}
