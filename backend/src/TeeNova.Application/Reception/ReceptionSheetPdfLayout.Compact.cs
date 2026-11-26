using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace TeeNova.Reception;

internal sealed partial class ReceptionSheetPdfLayout
{
    private sealed record Entry(int Group, ReceptionSizeRow Row);
    private sealed record TableRow(string[] Values, bool Subtotal = false);

    private void CompactDetails(ReceptionSheetPdfSnapshot sheet)
    {
        double Field(int i) => Margin + i * ColumnWidth;
        Cells([$"接单日期：{sheet.Received}", $"预计可取日期：{sheet.PickupDate ?? "待定"}"], Field);
        Cells([$"客户：{Value(sheet.Customer, "未填写")}", $"联系电话：{Value(sheet.Phone, "未填写")}"], Field);
        Cells([$"总价：{Amount(sheet.TotalPrice)}", $"订金：{Amount(sheet.Deposit)}"], Field);
        WritePayments(sheet.Payments);
        Flow($"关联服装预计费用：{Value(sheet.PrintEstimate, "未随工单保存")}", "关联服装预计费用");
        if (sheet.Layout?.Groups is not { Length: > 0 } groups) return;

        Rule();
        var entries = groups.SelectMany((group, i) => group.Rows.Select(row => new Entry(i + 1, row))).ToArray();
        foreach (var (group, i) in groups.Select((group, i) => (group, i + 1)))
        {
            var title = $"#{i} {Inline(group.Heading)}";
            var prints = group.Prints switch
            {
                null => "印花规格待确认",
                [] => "印花费另计",
                _ => string.Join("、", group.Prints.Select(p =>
                    $"{Value(Area(p.Area), "位置待确认")}（{Value(p.Size, "大小待确认")}）"))
            };
            var description = $"{title}（{Total(group.Rows)} 件） · {prints}";
            if (!string.IsNullOrWhiteSpace(group.Notes)) description += $" · {group.Notes}";
            Flow(description, title);
        }

        var sections = entries.GroupBy(entry => Audience(groups[entry.Group - 1]))
            .ToDictionary(s => s.Key, s => s.ToArray());
        var aligned = MatchingColumns(sections, groups);
        foreach (var (audience, rows) in sections)
            GarmentSection(audience, rows, aligned.GetValueOrDefault(audience), groups);

        if (_y + LineHeight > LastBodyBaseline) Continue("服装明细");
        Cells(["总件数", Total(entries.Select(e => e.Row))], i => i switch
            { 0 => Margin + 8, 1 => Right - 65, _ => Right }, true);
        _y += 8;
    }

    private static string Audience(ReceptionGarmentGroup group) => group.PricingKind switch
    {
        "tee" or "hoodie" => "成人",
        "kidsTee" or "kidsHoodie" => "童装",
        null when Regex.IsMatch(group.Heading, @"儿童|童装|童款|小童|大童|\b(kids?|child(?:ren)?|youth)\b",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant) => "童装",
        null when Regex.IsMatch(group.Heading, @"成人|\badults?\b",
            RegexOptions.IgnoreCase | RegexOptions.CultureInvariant) => "成人",
        _ => "其他",
    };

    private static string Total(IEnumerable<ReceptionSizeRow> rows)
    {
        var sum = 0;
        foreach (var row in rows)
        {
            if (row.Quantity is null) return "待核";
            sum += row.Quantity.Value;
        }
        return sum.ToString(CultureInfo.InvariantCulture);
    }

    private static Dictionary<string, (int Group, string Colour)[]> MatchingColumns(
        Dictionary<string, Entry[]> sections, ReceptionGarmentGroup[] groups)
    {
        if (!sections.TryGetValue("成人", out var adult) || !sections.TryGetValue("童装", out var kids))
            return [];
        string DesignKey(int id)
        {
            var group = groups[id - 1];
            var style = group.PricingKind switch { "kidsTee" => "tee", "kidsHoodie" => "hoodie", _ => group.PricingKind };
            var name = Regex.Replace(group.Heading, @"成人|儿童|童装|童款|小童|大童|\b(adults?|kids?|child(?:ren)?|youth)\b",
                "", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant).Trim().ToUpperInvariant();
            return $"{style}|{name}";
        }
        var adults = adult.Select(e => e.Group).Distinct().ToLookup(DesignKey);
        var children = kids.Select(e => e.Group).Distinct().ToLookup(DesignKey);
        if (adults.Count != children.Count ||
            adults.Any(design => design.Count() != 1 || children[design.Key].Count() != 1)) return [];
        var slots = adult.Concat(kids).GroupBy(e => e.Row.Colour).SelectMany(c =>
            c.Select(e => (Design: DesignKey(e.Group), Colour: c.Key)).Distinct()).ToArray();
        if (slots.Length > 6) return [];
        return new()
        {
            ["成人"] = slots.Select(c => (adults[c.Design].Single(), c.Colour)).ToArray(),
            ["童装"] = slots.Select(c => (children[c.Design].Single(), c.Colour)).ToArray()
        };
    }

    private void GarmentSection(string audience, Entry[] entries, (int Group, string Colour)[]? aligned,
        ReceptionGarmentGroup[] groups)
    {
        // Saved group identity includes artwork, garment style and print instructions.
        // Equal colours or equivalent-looking headings in different groups stay independent.
        var columns = aligned ?? entries.GroupBy(e => e.Row.Colour)
            .SelectMany(colour => colour.Select(e => (e.Group, Colour: colour.Key)).Distinct()).ToArray();
        var pairs = entries.ToLookup(e => (e.Group, e.Row.Colour, e.Row.Size));
        var sizes = entries.GroupBy(e => e.Group).Select(group => group.Select(e => e.Row.Size).Distinct().ToArray())
            .OrderByDescending(groupSizes => groupSizes.Length).SelectMany(groupSizes => groupSizes).Distinct().ToArray();
        if (columns.Length > 6 || entries.Length != pairs.Count ||
            columns.Any(c => c.Colour.Length > 24) || sizes.Any(s => s.Length > 20) ||
            (sizes.Length == entries.Length && columns.Length > 1))
        {
            var rows = entries.Select(e => new TableRow([$"#{e.Group}", Inline(Value(e.Row.Colour, "未注明")),
                Inline(Value(e.Row.Size, "未注明")), Quantity(e.Row.Quantity)])).ToList();
            rows.Add(new([$"{audience}小计", "", "", Total(entries.Select(e => e.Row))], true));
            double[] widths = [Margin + 8, 126, 325, Right - 65, Right];
            CompactTable(audience, ["分组", "衣服颜色", "尺码", "数量（件）"], rows, i => widths[i]);
            return;
        }

        const int first = Margin + 8;
        var width = (Right - 65 - (first + 64)) / columns.Length;
        string ColumnHeader((int Group, string Colour) column)
        {
            var label = $"#{column.Group}";
            var parts = groups[column.Group - 1].Heading.Split('|', '｜');
            if (parts.Length == 2)
            {
                var design = Regex.Replace(parts[1].Trim(), @"\s*(图案|设计)$", "").Trim();
                var named = $"{label} {design}";
                if (design.Length > 0 && WrapCompact(named, width - 6, Body).Length == 1) label = named;
            }
            return $"{label}\n{Inline(Value(column.Colour, "未注明"))}";
        }
        var headers = new[] { "图案/分组\n衣服颜色\n尺码" }.Concat(columns.Select(ColumnHeader)).Append("合计").ToArray();
        var grid = new List<TableRow>();
        foreach (var size in sizes)
        {
            var row = new List<string> { Inline(Value(size, "未注明")) };
            foreach (var column in columns)
            {
                var match = pairs[(column.Group, column.Colour, size)].SingleOrDefault();
                row.Add(match is null ? "—" : Quantity(match.Row.Quantity));
            }
            row.Add(Total(entries.Where(e => e.Row.Size == size).Select(e => e.Row)));
            grid.Add(new(row.ToArray()));
        }
        var columnEntries = entries.ToLookup(e => (e.Group, e.Row.Colour), e => e.Row);
        grid.Add(new(new[] { $"{audience}小计" }.Concat(columns.Select(c =>
            columnEntries.Contains(c) ? Total(columnEntries[c]) : "—"))
            .Append(Total(entries.Select(e => e.Row))).ToArray(), true));
        double ColumnX(int i) => i == 0 ? first : i == headers.Length ? Right : first + 64 + (i - 1) * width;
        CompactTable(audience, headers, grid, ColumnX);
    }

    private void CompactTable(string audience, string[] headers, List<TableRow> rows, Func<int, double> x)
    {
        var title = $"服装明细 · {audience}";
        var header = Bands(headers);
        var headerHeight = header.Max(band => band.Length) * LineHeight;
        var first = true;
        foreach (var row in rows)
        {
            var bands = Bands(row.Values);
            var height = bands.Max(band => band.Length) * LineHeight;
            if (first || _y + height > LastBodyBaseline)
            {
                if (_y + 24 + headerHeight + height > LastBodyBaseline) OpenPage();
                Write([first ? title : $"{title}（续）"], Margin, Right, 13, true);
                Page.Rules.Add(new(_y - 12, true, headerHeight));
                Draw(header, true);
                first = false;
            }
            Draw(bands, row.Subtotal);
            Page.Rules.Add(new(_y - LineHeight + 4.5, false));
        }
        _y += 6;

        string[][] Bands(string[] values) => values.Select((value, i) =>
            Wrap(value, x(i), x(i + 1) - 4, Body)).ToArray();

        void Draw(string[][] bands, bool accent)
        {
            var height = bands.Max(band => band.Length);
            for (var line = 0; line < height; line++)
            {
                for (var i = 0; i < bands.Length; i++)
                {
                    if (line < bands[i].Length && bands[i][line].Length > 0)
                        Page.Lines.Add(new(bands[i][line], x(i), _y, Body, x(i + 1) - 4, accent));
                }
                _y += LineHeight;
            }
        }
    }

    private static string[] WrapCompact(string value, double width, int size)
    {
        // Conservative advance widths for the renderer's Droid Sans Fallback font.
        // Other scripts retain a full em and the renderer checks every final line.
        static double Em(Rune r) => r.Value switch
        {
            ' ' or '!' or '\'' or ',' or '.' or ':' or ';' or 'J' or 'i' or 'j' or 'l' => 0.30,
            '(' or ')' or '-' or '/' or 'I' or '[' or '\\' or ']' or 'f' or 'r' or 't' or '{' or '}' => 0.40,
            '"' or '?' or 'F' or 'L' or '_' or 'c' or 'k' or 's' or 'v' or 'x' or 'y' or 'z' => 0.50,
            >= '0' and <= '9' => 0.56,
            '#' => 0.65,
            'm' or 'w' or 'M' or 'W' or '%' or '@' => 0.90,
            >= 'a' and <= 'z' => 0.60,
            >= 'A' and <= 'Z' => 0.80,
            _ => 1.0
        };
        var lines = new List<string>();
        foreach (var paragraph in value.ReplaceLineEndings("\n").Split('\n'))
        {
            var runes = paragraph.Replace('\t', ' ').EnumerateRunes().Where(r =>
                Rune.GetUnicodeCategory(r) is not (UnicodeCategory.Control or UnicodeCategory.Format)).ToArray();
            if (runes.Length == 0) lines.Add("");
            for (var start = 0; start < runes.Length;)
            {
                double used = 0;
                int end = start, space = -1;
                while (end < runes.Length && (used + Em(runes[end]) * size <= width || end == start))
                {
                    if (runes[end].Value == ' ') space = end;
                    used += Em(runes[end++]) * size;
                }
                if (end < runes.Length && space > start && runes[end - 1].IsAscii && runes[end].IsAscii &&
                    Rune.IsLetterOrDigit(runes[end - 1]) && Rune.IsLetterOrDigit(runes[end])) end = space + 1;
                lines.Add(string.Concat(runes[start..end]).Trim());
                start = end;
            }
        }
        return lines.ToArray();
    }
}
