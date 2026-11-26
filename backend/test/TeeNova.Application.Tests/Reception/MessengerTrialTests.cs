using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using TeeNova.Reception;

namespace TeeNova.Tests.Reception;

public class MessengerTrialTests
{
    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void Image_is_visible_only_after_both_messages_even_with_reordering(bool textFirst)
    {
        var sheet = new ReceptionSheet(Guid.NewGuid(), "TEST-001", "", null, "");
        if (textFirst) sheet.ConfirmTestImage(2100);
        Assert.Null(sheet.ReadTestArtwork());
        sheet.StoreTestImage("mid.test", 2000, [1,2,3], "image/png");
        if (!textFirst) Assert.Null(sheet.ReadTestArtwork());
        sheet.ConfirmTestImage(2100);
        sheet.CheckRepeatedImage("mid.test");
        Assert.Equal(new byte[]{1,2,3}, sheet.ReadTestArtwork()!.Value.Bytes);
    }

    [Fact]
    public void Prompt_and_saved_receipt_follow_durable_sheet_state()
    {
        var sheet = new ReceptionSheet(Guid.NewGuid(), "TEST-001", "", null, "");
        Assert.Null(sheet.NextTrialReply());
        sheet.StoreTestImage("mid.1", 1000, [1], "image/png");
        Assert.Equal("pending", sheet.NextTrialReply()?.Stage);
        sheet.MarkTrialReplySent("pending");
        Assert.Null(sheet.NextTrialReply());
        sheet.ConfirmTestImage(2000);
        Assert.Equal("saved", sheet.NextTrialReply()?.Stage);
        sheet.MarkTrialReplySent("saved");
        Assert.Null(sheet.NextTrialReply());
    }

    [Fact]
    public void Ambiguous_images_or_an_old_confirmation_do_not_release_artwork()
    {
        var sheet = new ReceptionSheet(Guid.NewGuid(), "TEST-001", "", null, "");
        sheet.ConfirmTestImage(1000);
        sheet.StoreTestImage("mid.1", 2000, [1], "image/png");
        Assert.Null(sheet.ReadTestArtwork());
        sheet.CheckRepeatedImage("mid.2");
        sheet.ConfirmTestImage(3000);
        Assert.Null(sheet.ReadTestArtwork());
    }

    [Theory]
    [InlineData("100470245028245", "other", true, true)]
    [InlineData("other", "staff", true, true)]
    [InlineData("100470245028245", "staff", false, false)]
    public async Task Webhook_ignores_other_people_and_pages_and_rejects_invalid_signatures(
        string page, string sender, bool signed, bool accepted)
    {
        var controller = Controller();
        var item = new { sender = new { id = sender }, recipient = new { id = page }, timestamp = 1000,
            message = new { mid = "mid.1", text = "TEST-001 左胸" } };
        var bytes = JsonSerializer.SerializeToUtf8Bytes(new { @object = "page", entry = new[] { new { id = page, messaging = new[] { item } } } });
        controller.Request.Body = new MemoryStream(bytes);
        controller.Request.Headers["X-Hub-Signature-256"] = "sha256=" +
            Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(signed ? "test-secret" : "other"), bytes));
        // The repository is deliberately absent. Passing cases must exit before any sheet access.
        var result = await controller.Receive(default);
        if (accepted) Assert.IsType<OkResult>(result);
        else Assert.IsType<UnauthorizedResult>(result);
    }

    [Fact]
    public void Verification_returns_only_the_challenge_for_the_correct_token()
    {
        var controller = Controller();
        controller.Request.QueryString = new QueryString("?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=12345");
        Assert.IsType<ForbidResult>(controller.Verify());
        controller.Request.QueryString = new QueryString("?hub.mode=subscribe&hub.verify_token=trial-token&hub.challenge=12345");
        Assert.Equal("12345", Assert.IsType<ContentResult>(controller.Verify()).Content);
    }

    private static MessengerTrialController Controller()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> {
            ["MessengerTrial:VerifyToken"]="trial-token", ["MessengerTrial:AppSecret"]="test-secret",
            ["MessengerTrial:StaffPsid"]="staff", ["MessengerTrial:SheetId"]=Guid.NewGuid().ToString()
        }).Build();
        return new MessengerTrialController(config, null!) {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext() }
        };
    }
}
