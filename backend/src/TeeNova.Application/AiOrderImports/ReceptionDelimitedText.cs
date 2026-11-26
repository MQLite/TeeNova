using System.Text;
using Volo.Abp;

namespace TeeNova.AiOrderImports;

internal sealed record ReceptionCsvRow(int Line, string[] Cells);

internal static class ReceptionDelimitedText
{
    public static ReceptionCsvRow[] ParseCsv(string content)
    {
        var text = Normalize(content);
        var separator = DetectSeparator(text.TrimStart('\n'));
        var rows = new List<ReceptionCsvRow>();
        var cells = new List<string>();
        var field = new StringBuilder();
        var line = 1;
        var recordStart = 1;
        var quoted = false;
        var closedQuote = false;

        for (var offset = 0; offset <= text.Length; offset++)
        {
            var end = offset == text.Length;
            var ch = end ? '\n' : text[offset];
            if (quoted)
            {
                if (end) throw Invalid(recordStart);
                if (ch == '"')
                {
                    if (offset + 1 < text.Length && text[offset + 1] == '"')
                    {
                        field.Append('"');
                        offset++;
                    }
                    else
                    {
                        quoted = false;
                        closedQuote = true;
                    }
                }
                else
                {
                    field.Append(ch);
                    if (ch == '\n') line++;
                }
                continue;
            }
            if (ch == separator || ch == '\n')
            {
                if (closedQuote || ch == separator || cells.Count != 0 || field.Length != 0)
                {
                    cells.Add(field.ToString());
                    if (cells.Count > 64) throw Invalid(recordStart);
                }
                field.Clear();
                closedQuote = false;
                if (ch == '\n')
                {
                    if (cells.Count > 0)
                    {
                        if (rows.Count >= 501 || (rows.Count > 0 && cells.Count != rows[0].Cells.Length))
                            throw Invalid(recordStart);
                        rows.Add(new(recordStart, cells.ToArray()));
                        cells.Clear();
                    }
                    recordStart = ++line;
                }
                continue;
            }
            if (closedQuote) throw Invalid(recordStart);
            if (ch == '"')
            {
                if (field.Length != 0) throw Invalid(recordStart);
                quoted = true;
            }
            else
                field.Append(ch);
        }
        if (rows.Count == 0 || rows[0].Cells.All(string.IsNullOrWhiteSpace)) throw Invalid(1);
        return rows.ToArray();
    }

    public static string Normalize(string content) => content.TrimStart('\ufeff').Replace("\r\n", "\n").Replace('\r', '\n');

    private static char DetectSeparator(string headerAndRows)
    {
        var candidates = new[] { ',', ';', '\t' };
        var counts = new int[candidates.Length];
        var quoted = false;
        foreach (var ch in headerAndRows)
        {
            if (ch == '"') quoted = !quoted;
            if (quoted) continue;
            if (ch == '\n') break;
            var index = Array.IndexOf(candidates, ch);
            if (index >= 0) counts[index]++;
        }
        return candidates[Array.IndexOf(counts, counts.Max())];
    }

    private static BusinessException Invalid(int line) => new(AiOrderImportErrorCodes.InvalidSourceContent,
        $"CSV record starting at line {line} is invalid, too large, or has a different number of cells than the header.");
}
