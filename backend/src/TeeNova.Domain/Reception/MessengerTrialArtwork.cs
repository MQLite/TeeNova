using Volo.Abp.Data;

namespace TeeNova.Reception;

// One test sheet holds one artwork. Keeping these values on the aggregate makes
// the pending image, confirmation and concurrency check part of the same save.
public static class MessengerTrialArtwork
{
    public const string SheetName = "TEST-001";
    public const string Confirmation = "TEST-001 左胸";
    private const string ImageMid = "MessengerTrialImageId";
    private const string ImageTime = "MessengerTrialImageTime";
    private const string ConfirmationTime = "MessengerTrialConfirmationTime";
    private const string Content = "MessengerTrialImage";
    private const string Mime = "MessengerTrialMime";

    public static bool HasImage(this ReceptionSheet sheet) => sheet.GetProperty<string>(ImageMid) != null;
    public static bool HasAmbiguousImages(this ReceptionSheet sheet) => sheet.GetProperty<bool>("MessengerTrialAmbiguous");
    public static bool IsTrialReady(this ReceptionSheet sheet)
    {
        if (!sheet.HasImage() || sheet.HasAmbiguousImages()) return false;
        var delta = sheet.GetProperty<long>(ConfirmationTime) - sheet.GetProperty<long>(ImageTime);
        return delta is >= 0 and <= 900_000;
    }

    public static void StoreTestImage(this ReceptionSheet sheet, string mid, long timestamp, byte[] bytes, string mime)
    {
        if (sheet.HasImage()) return;
        sheet.SetProperty(ImageMid, mid);
        sheet.SetProperty(ImageTime, timestamp);
        sheet.SetProperty(Content, Convert.ToBase64String(bytes));
        sheet.SetProperty(Mime, mime);
    }

    public static void CheckRepeatedImage(this ReceptionSheet sheet, string mid)
    {
        if (!sheet.IsTrialReady() && sheet.HasImage() && sheet.GetProperty<string>(ImageMid) != mid)
            sheet.SetProperty("MessengerTrialAmbiguous", true);
    }

    public static void ConfirmTestImage(this ReceptionSheet sheet, long timestamp)
    {
        if (!sheet.IsTrialReady() && timestamp > sheet.GetProperty<long>(ConfirmationTime))
            sheet.SetProperty(ConfirmationTime, timestamp);
    }

    public static (byte[] Bytes, string Mime)? ReadTestArtwork(this ReceptionSheet sheet) =>
        sheet.IsTrialReady() ? (Convert.FromBase64String(sheet.GetProperty<string>(Content)!), sheet.GetProperty<string>(Mime)!) : null;

    public static (string Stage, string Text)? NextTrialReply(this ReceptionSheet sheet)
    {
        if (!sheet.HasImage()) return null;
        (string Stage, string Text) reply = sheet.HasAmbiguousImages()
            ? ("ambiguous", "这次试单收到了多张图片，请在接待工作台核对。")
            : sheet.IsTrialReady() ? ("saved", "已存入 TEST-001 · 左胸")
            : ("pending", "收到测试图，请回复 TEST-001 左胸。");
        return sheet.GetProperty<string>("MessengerTrialReply") == reply.Stage ? null : reply;
    }

    public static void MarkTrialReplySent(this ReceptionSheet sheet, string stage) =>
        sheet.SetProperty("MessengerTrialReply", stage);
}
