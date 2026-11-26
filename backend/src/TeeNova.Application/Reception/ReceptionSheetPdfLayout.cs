using System.Globalization;
using System.Text;

namespace TeeNova.Reception;

internal sealed record ReceptionPdfText(string Text, double X, double Y, int Size, double Right, bool Accent);
internal sealed record ReceptionPdfRule(double Y, bool Filled);
internal sealed record ReceptionPdfPage(List<ReceptionPdfText> Lines, List<ReceptionPdfRule> Rules);

internal sealed class ReceptionSheetPdfLayout
{
    public const double Width = 210 * 72d / 25.4;
    public const double Height = 297 * 72d / 25.4;
    private const int Margin = 36;
    private const double Right = Width - Margin;
    private const int Body = 11;
    private const int LineHeight = 16;
    private const int LastBodyBaseline = 783;
    private const double ColumnWidth = (Right - Margin) / 2;

    private static readonly double[] GarmentColumns = [Margin + 8, 86, 298, 470, Right];
    private readonly List<ReceptionPdfPage> _pages = [];
    private ReceptionPdfPage Page => _pages[^1];
    private double _y;

    private ReceptionSheetPdfLayout(ReceptionSheetPdfSnapshot snapshot)
    {
        OpenPage();
        Write(Wrap(Inline(snapshot.Layout?.Title ?? "接待工作单"), Margin, Right, 22), Margin, Right, 22, true);
        Write([$"工作单 {snapshot.SheetId:D}  ·  门店自取"], Margin, Right);
        Rule();
        Fields(("接单日期", snapshot.Received), ("预计可取日期", snapshot.PickupDate ?? "待定"));
        Fields(("客户", Value(snapshot.Customer, "未填写")), ("联系电话", Value(snapshot.Phone, "未填写")));
        Fields(("总价", Amount(snapshot.TotalPrice)), ("订金", Amount(snapshot.Deposit)));
        TextSection("关联服装预计费用", Value(snapshot.PrintEstimate, "未随工单保存"));
        Rule();
        if (snapshot.Layout is { } layout)
        {
            for (var i = 0; i < layout.Groups.Length; i++)
                Garments(layout.Groups[i], i + 1);
        }
        TextSection("制作说明", Value(snapshot.Instructions, "无"));
        for (var i = 0; i < _pages.Count; i++)
            _pages[i].Lines.Add(new($"第 {i + 1} 页 / 共 {_pages.Count} 页", 438, Height - Margin, 10, Right, true));
    }

    public static IReadOnlyList<ReceptionPdfPage> Build(ReceptionSheetPdfSnapshot snapshot) =>
        new ReceptionSheetPdfLayout(snapshot)._pages;

    private void OpenPage()
    {
        _pages.Add(new([], []));
        _y = 48;
        Write(["OtahuhuPrintingShop"], Margin, Right, 12, true);
        _y += 8;
    }

    private void Rule()
    {
        Page.Rules.Add(new(_y - 3, false));
        _y += 13;
    }

    private void Fields(params (string Label, string Value)[] fields)
    {
        Cells(fields.Select(x => x.Label).ToArray(), index => Margin + index * ColumnWidth, true);
        Cells(fields.Select(x => x.Value).ToArray(), index => Margin + index * ColumnWidth);
        _y += 6;
    }

    private void Garments(ReceptionGarmentGroup group, int index)
    {
        var title = $"{index}. {Inline(group.Heading)}";
        var heading = Wrap(title, Margin, Right, 15);
        if (_y + heading.Length * 20 + 68 > LastBodyBaseline) OpenPage();
        Write(heading, Margin, Right, 15, true);

        if (group.Prints is { Length: > 0 } prints)
        {
            foreach (var print in prints)
                Flow($"印花位置：{Inline(Value(Area(print.Area), "待确认"))}  ·  大小：{Inline(Value(print.Size, "待确认"))}", title);
        }
        else
        {
            Flow(group.Prints is null ? "印花规格待确认" : "印花费另计", title);
        }
        if (!string.IsNullOrWhiteSpace(group.Notes)) Flow(group.Notes, title);

        var firstRow = group.Rows[0];
        var firstCells = new[] { "1", Value(firstRow.Colour, "未注明"), Value(firstRow.Size, "未注明"), Quantity(firstRow.Quantity) };
        if (_y + 25 + CellHeight(firstCells, Column) > LastBodyBaseline) Continue(title);
        GarmentHeader();
        for (var i = 0; i < group.Rows.Length; i++)
        {
            var row = group.Rows[i];
            var cells = new[] { (i + 1).ToString(CultureInfo.InvariantCulture), Value(row.Colour, "未注明"),
                Value(row.Size, "未注明"), Quantity(row.Quantity) };
            if (_y + CellHeight(cells, Column) > LastBodyBaseline)
            {
                Continue(title);
                GarmentHeader();
            }
            Cells(cells, Column);
            Page.Rules.Add(new(_y - 9, false));
            _y += 4;
        }
        if (_y + LineHeight > LastBodyBaseline)
        {
            Continue(title);
            GarmentHeader();
        }
        var total = group.Rows.Any(row => row.Quantity is null) ? "待核" :
            group.Rows.Sum(row => row.Quantity!.Value).ToString(CultureInfo.InvariantCulture);
        Cells(["", "合计", "", total], Column, true);
        _y += 12;
    }

    private static double Column(int index) => GarmentColumns[index];

    private void GarmentHeader()
    {
        Page.Rules.Add(new(_y - 12, true));
        Cells(["序号", "衣服颜色", "尺码", "数量（件）"], Column, true);
        _y += 4;
    }

    private void TextSection(string title, string value)
    {
        if (_y + 2 * LineHeight > LastBodyBaseline) OpenPage();
        Write([title], Margin, Right, 15, true);
        Flow(value, title);
    }

    private void Flow(string text, string title)
    {
        foreach (var line in Wrap(text, Margin, Right, Body))
        {
            if (_y > LastBodyBaseline) Continue(title);
            Write([line], Margin, Right);
        }
        _y += 4;
    }

    private void Continue(string title)
    {
        OpenPage();
        Write(Wrap($"{title}（续）", Margin, Right, 14), Margin, Right, 14, true);
    }

    private void Cells(string[] values, Func<int, double> x, bool accent = false)
    {
        var bands = values.Select((value, index) => Wrap(Inline(value), x(index), x(index + 1) - 8, Body)).ToArray();
        var height = bands.Max(lines => lines.Length);
        for (var row = 0; row < height; row++)
        {
            for (var column = 0; column < bands.Length; column++)
            {
                var lines = bands[column];
                if (lines.Length > row && lines[row].Length > 0)
                    Page.Lines.Add(new(lines[row], x(column), _y, Body, x(column + 1) - 8, accent));
            }
            _y += LineHeight;
        }
    }

    private static int CellHeight(string[] values, Func<int, double> x) =>
        values.Select((value, index) => Wrap(Inline(value), x(index), x(index + 1) - 8, Body).Length * LineHeight).Max();

    private void Write(string[] lines, double x, double right, int size = Body, bool accent = false)
    {
        foreach (var line in lines)
        {
            if (line.Length > 0) Page.Lines.Add(new(line, x, _y, size, right, accent));
            _y += Math.Max(LineHeight, size + 5);
        }
    }

    private static string[] Wrap(string value, double x, double right, int size)
    {
        // Use a full em for each glyph to leave room for Chinese and mixed-script fields.
        // The renderer verifies actual glyph widths before writing any line.
        var capacity = Math.Max(1, (int)((right - x - 4) / size));
        var lines = new List<string>();
        foreach (var paragraph in value.ReplaceLineEndings("\n").Split('\n'))
        {
            var line = new StringBuilder();
            var glyphs = 0;
            foreach (var glyph in paragraph.EnumerateRunes())
            {
                if (glyph == new Rune('\t')) line.Append(' ');
                else if (Rune.GetUnicodeCategory(glyph) is UnicodeCategory.Control or UnicodeCategory.Format) continue;
                else line.Append(glyph.ToString());
                if (++glyphs != capacity) continue;
                lines.Add(line.ToString().Trim());
                line.Clear();
                glyphs = 0;
            }
            if (glyphs > 0 || paragraph.Length == 0) lines.Add(line.ToString().Trim());
        }
        return lines.Count == 0 ? [""] : lines.ToArray();
    }

    private static string Value(string? value, string fallback) => string.IsNullOrWhiteSpace(value) ? fallback : value;
    private static string Inline(string value) => value.ReplaceLineEndings(" ");
    private static string Quantity(int? quantity) => quantity?.ToString(CultureInfo.InvariantCulture) ?? "待核";
    private static string Amount(decimal? amount) => amount is { } value ?
        $"NZD {value.ToString("N2", CultureInfo.InvariantCulture)}" : "未填写";

    private static string Area(string code) => code switch
    {
        "FRONT_CENTER" => "正面中央",
        "BACK_CENTER" => "背面中央",
        "LEFT_CHEST" => "左胸",
        "RIGHT_CHEST" => "右胸",
        "LEFT_SLEEVE" => "左袖",
        "RIGHT_SLEEVE" => "右袖",
        _ => code,
    };
}
