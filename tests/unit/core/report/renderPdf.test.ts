import { describe, it, expect } from "vitest";
import { renderReportPdf } from "../../../../src/core/report/renderPdf";
import type { Report } from "../../../../src/core/report/types";
import { reportFixture } from "../../../fixtures/report";
import { pdfBlobText, pdfPageCount } from "../../../helpers/pdf";

function pdfSource(report: Report) {
    return pdfBlobText(renderReportPdf(report));
}

/** Baseline height of the text drawn as `(text) Tj`; PDF heights grow upward. */
function textHeight(source: string, text: string): number {
    const escaped = text.replace(/[()]/g, "\\$&");
    const match = source.match(new RegExp(`([\\d.]+) ([\\d.]+) Td\\s+\\(${escaped}\\) Tj`));
    return Number(match![2]);
}

describe("renderReportPdf", () => {
    it("returns one-page PDF blob with block text", async () => {
        const blob = renderReportPdf(reportFixture);
        expect(blob.type).toBe("application/pdf");
        const text = await pdfSource(reportFixture);
        expect(text).toMatch(/^%PDF/);
        expect(text).toContain("(Over 1 year)");
        expect(text).toContain("(Unknown)");
        expect(pdfPageCount(text)).toBe(1);
    });

    it("flows long list onto next pages", async () => {
        const items = Array.from({ length: 200 }, (_, i) => `pkg-${i}`);
        const text = await pdfSource({ title: "t", blocks: [{ kind: "list", items }] });
        expect(pdfPageCount(text)).toBeGreaterThan(1);
        expect(text).toContain("(pkg-199)");
    });

    it('prints "?" for character outside built-in font', async () => {
        const text = await pdfSource({
            title: "t",
            blocks: [{ kind: "paragraph", text: "MIT ⚠ é" }],
        });
        expect(text).toContain("(MIT ? \xe9)");
    });

    it("draws text under table, not over its last row", async () => {
        const text = await pdfSource({
            title: "t",
            blocks: [
                { kind: "table", headers: ["H"], rows: [["Cell1"], ["Cell2"]] },
                { kind: "paragraph", text: "AFTER" },
            ],
        });
        expect(textHeight(text, "AFTER")).toBeLessThan(textHeight(text, "Cell2"));
    });

    it("repeats table header on next page", async () => {
        const rows = Array.from({ length: 120 }, (_, i) => [`row-${i}`]);
        const text = await pdfSource({
            title: "t",
            blocks: [{ kind: "table", headers: ["HEAD"], rows }],
        });
        expect(pdfPageCount(text)).toBeGreaterThan(1);
        expect(text.match(/\(HEAD\) Tj/g)!.length).toBeGreaterThan(1);
    });
});
