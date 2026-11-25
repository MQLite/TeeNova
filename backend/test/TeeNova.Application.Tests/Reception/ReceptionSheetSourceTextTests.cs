using Microsoft.AspNetCore.Mvc;
using System.Reflection;
using TeeNova.AiOrderImports;
using TeeNova.AiOrderImports.Recognition;
using TeeNova.Reception;
using Volo.Abp.Domain.Entities;
using Volo.Abp.Domain.Repositories;

namespace TeeNova.Tests.Reception;

public class ReceptionSheetSourceTextTests
{
    private readonly ReceptionSheet sheet = new(Guid.NewGuid(), "Customer", "", null, "");
    private readonly Guid importId = Guid.NewGuid();
    private readonly Guid adminId = Guid.NewGuid();

    [Fact]
    public async Task Saving_reopening_retrying_and_replacing_keep_the_photo_and_text_independent()
    {
        var photo = new ReceptionPhotoSource(Guid.NewGuid(), Guid.NewGuid());
        sheet.SetSourcePhoto(photo);
        var document = Document("text/plain");
        var controller = Controller(document);
        var input = new ReceptionSheetsController.SheetInput("Customer", "", null, "",
            Version: sheet.ConcurrencyStamp, SourceText: new(importId, document.Id));
        var saved = await Save(controller, input);
        Assert.Equal(input.SourceText, saved.SourceText);
        Assert.Equal(photo, saved.SourcePhoto);
        Assert.Equal(saved, await controller.Get(sheet.Id, default));

        // A lost response may be retried after retention deletes the original.
        document.MarkContentDeleted(DateTime.UtcNow);
        Assert.Equal(saved, await Save(controller, input));

        var legacyEdit = new ReceptionSheetsController.SheetInput("Updated", "", null, "", Version: saved.Version);
        var edited = await Save(controller, legacyEdit);
        Assert.Equal(input.SourceText, edited.SourceText);

        var replacement = Document("text/plain");
        controller = Controller(replacement);
        var replace = legacyEdit with { SourceText = new(importId, replacement.Id), ReplaceSourceText = true };
        Assert.IsType<ConflictObjectResult>(await controller.Save(sheet.Id, replace, default));
        var replaced = await Save(controller, replace with { Version = edited.Version });
        Assert.Equal(replace.SourceText, replaced.SourceText);
        var cleared = await Save(controller, legacyEdit with { Version = replaced.Version, ReplaceSourceText = true });
        Assert.Null(cleared.SourceText);
        Assert.Equal(photo, cleared.SourcePhoto);
    }

    [Theory]
    [InlineData("missing")]
    [InlineData("foreign")]
    [InlineData("deleted")]
    [InlineData("photo")]
    [InlineData("other-contract")]
    public async Task Rejects_invalid_text_source_links(string reason)
    {
        var document = Document(reason == "photo" ? "image/jpeg" : "text/plain");
        if (reason == "deleted") document.MarkContentDeleted(DateTime.UtcNow);
        var controller = Controller(document, reason == "other-contract" ? "other" : ReceptionRecognition.Contract);
        var input = new ReceptionSheetsController.SheetInput("Customer", "", null, "", Version: sheet.ConcurrencyStamp,
            SourceText: new(reason == "foreign" ? Guid.NewGuid() : importId, reason == "missing" ? Guid.NewGuid() : document.Id));
        Assert.IsType<BadRequestObjectResult>(await controller.Save(sheet.Id, input, default));
        Assert.Null(sheet.ReadSourceText());
    }

    [Fact]
    public async Task A_text_only_first_save_can_be_retried_then_extended_with_handwriting()
    {
        var document = Document("text/plain");
        var controller = Controller(document);
        var text = new ReceptionTextSource(importId, document.Id);
        // Simulate a completed insert whose response never reached the client.
        sheet.Revise("", "", null, "", null, null, null, null);
        sheet.SetSourceText(text);
        var retry = new ReceptionSheetsController.SheetInput(null, null, null, null, SourceText: text);
        var saved = await Save(controller, retry);
        Assert.Equal(text, saved.SourceText);
        var edited = await Save(controller, retry with { Version = saved.Version, SourceText = null,
            Handwriting = [new(false, [new(10, 20)])] });
        Assert.Equal(text, edited.SourceText);
        Assert.Single(edited.Handwriting!);
        Assert.Null(edited.SourcePhoto);
    }

    private async Task<ReceptionSheetsController.SheetDto> Save(ReceptionSheetsController controller,
        ReceptionSheetsController.SheetInput input) =>
        Assert.IsType<ReceptionSheetsController.SheetDto>(
            Assert.IsType<OkObjectResult>(await controller.Save(sheet.Id, input, default)).Value);

    private AiOrderSourceDocument Document(string contentType) => new(Guid.NewGuid(), importId, 1,
        AiOrderCaptureMethod.Upload, "private-key", contentType, 10, null, new string('0', 64), null, adminId,
        DateTime.UtcNow, null);

    private ReceptionSheetsController Controller(AiOrderSourceDocument document, string contract = ReceptionRecognition.Contract) =>
        new(SingleEntityRepository<ReceptionSheet>.For(sheet),
            SingleEntityRepository<AiOrderImport>.For(new(importId, adminId, contract, "key", new string('0', 64), "standard")),
            SingleEntityRepository<AiOrderSourceDocument>.For(document), null!, null!, null!);

    public class SingleEntityRepository<T> : DispatchProxy where T : class, IEntity<Guid>
    {
        private T entity = null!;

        public static IRepository<T, Guid> For(T entity)
        {
            var proxy = Create<IRepository<T, Guid>, SingleEntityRepository<T>>();
            ((SingleEntityRepository<T>)(object)proxy).entity = entity;
            return proxy;
        }

        protected override object? Invoke(MethodInfo? method, object?[]? args)
        {
            switch (method?.Name)
            {
                case "FindAsync":
                case "GetAsync":
                    return Task.FromResult(Equals(entity.Id, args![0]) ? entity : null);
                case "UpdateAsync":
                    Assert.Same(entity, args![0]);
                    ((IHasConcurrencyStamp)entity).ConcurrencyStamp = Guid.NewGuid().ToString();
                    return Task.FromResult(entity);
                default:
                    throw new NotSupportedException(method?.Name);
            }
        }
    }
}
