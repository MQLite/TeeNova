"""Render the server's fixed A4 layout. Worksheet fields are PDF text only."""

import json
import sys

try:
    import pymupdf as pdf
except ImportError:
    import fitz as pdf


def render(input_path, output_path):
    with open(input_path, encoding="utf-8") as source:
        layout = json.load(source)

    font = pdf.Font("cjk")
    ink = (0.10, 0.14, 0.19)
    accent = (0.16, 0.30, 0.40)
    divider = (0.75, 0.78, 0.81)
    heading_fill = (0.92, 0.94, 0.96)

    with pdf.open() as document:
        for planned in layout["pages"]:
            page = document.new_page(width=layout["width"], height=layout["height"])
            page.insert_font(fontname="Worksheet", fontbuffer=font.buffer)
            for rule in planned["rules"]:
                y = rule["y"]
                right = layout["width"] - 36
                if rule["filled"]:
                    page.draw_rect((36, y, right, y + 18), color=None, fill=heading_fill)
                else:
                    page.draw_line((36, y), (right, y), color=divider, width=0.5)
            for line in planned["lines"]:
                text = line["text"]
                if any(not font.has_glyph(ord(char), fallback=False) for char in text):
                    raise ValueError("The worksheet contains a glyph missing from the Chinese font.")
                if line["x"] + font.text_length(text, fontsize=line["size"]) > line["right"]:
                    raise ValueError("Text exceeds the worksheet column width.")
                page.insert_text((line["x"], line["y"]), text, fontname="Worksheet",
                                 fontsize=line["size"], color=accent if line["accent"] else ink)

        document.subset_fonts()
        document.save(output_path, garbage=4, deflate=True)


if __name__ == "__main__":
    render(sys.argv[1], sys.argv[2])
