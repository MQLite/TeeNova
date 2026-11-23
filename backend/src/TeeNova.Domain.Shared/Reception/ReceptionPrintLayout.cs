namespace TeeNova.Reception;

public sealed record ReceptionSizeRow(string Colour, string Size, int? Quantity);

public sealed record ReceptionGarmentGroup(string Heading, string Presentation, string Notes, ReceptionSizeRow[] Rows);

public sealed record ReceptionPrintLayout(string Title, ReceptionGarmentGroup[] Groups)
{
    public bool IsValid() =>
        Title is { Length: > 0 and <= 160 } && !string.IsNullOrWhiteSpace(Title) &&
        Groups is { Length: <= 40 } &&
        Groups.All(g => g != null && g.Heading is { Length: > 0 and <= 200 } &&
            g.Presentation is "matrix" or "rows" && g.Notes is { Length: <= 4000 } &&
            g.Rows is { Length: > 0 and <= 300 } && g.Rows.All(r =>
                r != null && r.Colour is { Length: <= 100 } && r.Size is { Length: <= 100 } &&
                (r.Quantity == null || r.Quantity is >= 0 and <= 999999))) &&
        Groups.Sum(g => g.Rows.Length) <= 500;
}
