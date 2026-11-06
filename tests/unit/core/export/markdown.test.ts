import { describe, it, expect } from "vitest";
import { markdownExporter } from "../../../../src/core/export/exporters/markdown";
import { exportDocumentFixture, exportDocumentWith } from "../../../fixtures/exportDocument";

async function renderCells(cells: string[]): Promise<string> {
    const exportDocument = exportDocumentWith([
        { title: "s", headers: cells.map(() => "h"), rows: [cells] },
    ]);
    const text = await (await markdownExporter.render(exportDocument)).text();
    return text.trimEnd().split("\n").at(-1) ?? "";
}

describe("markdownExporter", () => {
    it("writes title, section headings, GFM tables, escapes pipe, newline and HTML", async () => {
        const blob = await markdownExporter.render(exportDocumentFixture);
        expect(blob.type).toBe("text/markdown;charset=utf-8");
        expect(await blob.text()).toBe(
            [
                "# my-app",
                "",
                "## Deps",
                "",
                "| Name | Note |",
                "| --- | --- |",
                '| vue | say "hi", a\\|b |',
                "| zod | line1 line2 |",
                "",
                "## Dev Deps",
                "",
                "| Name | Note |",
                "| --- | --- |",
                "| vite | \\<b\\>\\&\\</b\\> |",
                "",
            ].join("\n"),
        );
    });

    it("escapes link, image and code span syntax", async () => {
        expect(await renderCells(["[x](javascript:alert(1)) ![i](http://e/p.png) `c`"])).toBe(
            "| \\[x\\](javascript:alert(1)) !\\[i\\](http://e/p.png) \\`c\\` |",
        );
    });

    it("escapes title and section heading", async () => {
        const blob = await markdownExporter.render(
            exportDocumentWith([{ title: "[s](u)", headers: ["h"], rows: [] }], "<img src=x>"),
        );
        const lines = (await blob.text()).split("\n");
        expect(lines[0]).toBe("# \\<img src=x\\>");
        expect(lines[2]).toBe("## \\[s\\](u)");
    });

    it("joins CRLF and CR line breaks with space", async () => {
        expect(await renderCells(["a\r\nb\rc"])).toBe("| a b c |");
    });

    it("escapes backslash so pipe stays inside cell", async () => {
        expect(await renderCells(["a\\|b"])).toBe("| a\\\\\\|b |");
    });

    it("escapes math delimiters", async () => {
        expect(await renderCells(["$\\color{red}x$ $$y$$"])).toBe(
            "| \\$\\\\color{red}x\\$ \\$\\$y\\$\\$ |",
        );
    });
});
