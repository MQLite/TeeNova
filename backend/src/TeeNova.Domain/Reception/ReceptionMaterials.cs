using System.Security.Cryptography;
using System.Text;
using TeeNova.AiOrderImports;

namespace TeeNova.Reception;

public sealed record ReceptionMaterials(Guid ImportId, Guid[] DocumentIds, string Description)
{
    public const string SupplementName = "__reception_supplement.txt";

    public bool SameInputs(ReceptionMaterials? other) => other is not null &&
        ImportId == other.ImportId && Description == other.Description &&
        DocumentIds != null && other.DocumentIds != null && DocumentIds.SequenceEqual(other.DocumentIds);

    public bool MatchesUpload(IReadOnlyList<AiOrderSourceDocument> ordered)
    {
        if (ImportId == Guid.Empty || DocumentIds is not { Length: > 0 and <= 50 } ||
            Description is not { Length: <= 20000 } || ordered.Any(d => d.ImportId != ImportId || d.ContentDeletedAt.HasValue))
            return false;

        static bool IsNote(AiOrderSourceDocument d) => string.Equals(d.OriginalFileName, SupplementName, StringComparison.OrdinalIgnoreCase);
        var files = ordered.Where(d => !IsNote(d));
        if (!DocumentIds.SequenceEqual(files.Select(d => d.Id))) return false;
        var notes = ordered.Where(IsNote).ToArray();
        if (string.IsNullOrWhiteSpace(Description)) return notes.Length == 0;
        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Description)));
        return notes is [{ ContentType: "text/plain" } note] && hash.Equals(note.Sha256, StringComparison.OrdinalIgnoreCase);
    }
}
