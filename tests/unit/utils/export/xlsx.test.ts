import { describe, it, expect, vi } from "vitest";
import writeExcelFile from "write-excel-file/browser";
import { xlsxExporter } from "../../../../src/utils/export/exporters/xlsx";
import { exportDocumentFixture, exportDocumentWith } from "../../../fixtures/exportDocument";
import type { ExportSection } from "../../../../src/utils/export/types";

// Library writes compressed XML; capture the sheet options it gets instead.
vi.mock("write-excel-file/browser", async (importOriginal) => {
    const original = await importOriginal<typeof import("write-excel-file/browser")>();
    return { ...original, default: vi.fn(original.default) };
});

async function sheetsFor(sections: ExportSection[]) {
    vi.mocked(writeExcelFile).mockClear();
    await xlsxExporter.render(exportDocumentWith(sections));
    return vi.mocked(writeExcelFile).mock.calls[0][0] as unknown as Array<{
        sheet: string;
        columns: Array<{ width: number }>;
    }>;
}

describe("xlsxExporter", () => {
    it("returns ZIP blob", async () => {
        const blob = await xlsxExporter.render(exportDocumentFixture);
        const signature = new Uint8Array(await blob.arrayBuffer()).slice(0, 2);
        expect(String.fromCharCode(...signature)).toBe("PK");
    });

    it("replaces forbidden sheet name chars, cuts name to 31 chars", async () => {
        const sheets = await sheetsFor([
            { title: "a\\b/c?d*e[f]g:h", headers: ["N"], rows: [] },
            { title: "x".repeat(40), headers: ["N"], rows: [] },
        ]);
        expect(sheets.map((s) => s.sheet)).toEqual(["a b c d e f g h", "x".repeat(31)]);
    });

    it("sizes columns to longest cell within 8 to 60 chars", async () => {
        const [sheet] = await sheetsFor([
            {
                title: "s",
                headers: ["N", "Header", "Long"],
                rows: [["a", "twelve chars", "y".repeat(100)]],
            },
        ]);
        expect(sheet.columns).toEqual([{ width: 8 }, { width: 12 }, { width: 60 }]);
    });
});
