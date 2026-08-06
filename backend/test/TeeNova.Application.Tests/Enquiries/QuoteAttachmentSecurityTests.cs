using System.Text;

namespace TeeNova.Enquiries;

public sealed class QuoteAttachmentSecurityTests
{
    [Theory]
    [InlineData(".png", "89504E470D0A1A0A0000")]
    [InlineData(".jpg", "FFD8FF00")]
    [InlineData(".jpeg", "FFD8FFE0")]
    [InlineData(".webp", "524946460000000057454250")]
    [InlineData(".pdf", "255044462D312E37")]
    [InlineData(".ai", "255044462D312E37")]
    [InlineData(".ai", "252150532D41646F6265")]
    public void Accepts_only_expected_magic_bytes(string extension, string hex)
        => Assert.True(QuoteAttachmentService.SignatureMatches(extension, Convert.FromHexString(hex)));

    [Theory]
    [InlineData(".png", "3C7376673E")]
    [InlineData(".jpg", "89504E470D0A1A0A")]
    [InlineData(".webp", "52494646000000004E4F5045")]
    [InlineData(".pdf", "4D5A9000")]
    [InlineData(".ai", "504B0304")]
    [InlineData(".svg", "3C7376673E")]
    [InlineData(".exe", "4D5A9000")]
    public void Rejects_mismatched_or_disallowed_magic_bytes(string extension, string hex)
        => Assert.False(QuoteAttachmentService.SignatureMatches(extension, Convert.FromHexString(hex)));

    [Fact]
    public void Opaque_token_hash_does_not_contain_token()
    {
        var token = Convert.ToHexString(Guid.NewGuid().ToByteArray()).ToLowerInvariant();
        var hash = QuoteAttachmentService.Sha256(token);
        Assert.Equal(64, hash.Length);
        Assert.DoesNotContain(token, hash);
    }
}
