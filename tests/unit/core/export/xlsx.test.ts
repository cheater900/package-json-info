import { describe, it, expect, vi } from "vitest";
import writeExcelFile from "write-excel-file/universal";
import { xlsxExporter } from "../../../../src/core/export/exporters/xlsx";
import { exportDocumentFixture, exportDocumentWith } from "../../../fixtures/exportDocument";
import type { ExportSection } from "../../../../src/core/export/types";

// Library writes compressed XML; capture the sheet options it gets instead.
vi.mock("write-excel-file/universal", async (importOriginal) => {
    const original = await importOriginal<typeof import("write-excel-file/universal")>();
    return { ...original, default: vi.fn(original.default) };
});

async function sheetsFor(sections: ExportSection[]) {
    vi.mocked(writeExcelFile).mockClear();
    await xlsxExporter.render(exportDocumentWith(sections));
    return vi.mocked(writeExcelFile).mock.calls[0][0] as unknown as Array<{
        sheet: string;
        data: unknown[][];
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

    it("sizes column by header when row has fewer cells", async () => {
        const [sheet] = await sheetsFor([
            { title: "s", headers: ["Longer header", "N"], rows: [["a"]] },
        ]);
        expect(sheet.columns).toEqual([{ width: 13 }, { width: 8 }]);
    });

    it("keeps cell of exactly 32767 chars whole", async () => {
        const [sheet] = await sheetsFor([
            { title: "s", headers: ["N"], rows: [["x".repeat(32_767)]] },
        ]);
        expect(sheet.data[1][0]).toBe("x".repeat(32_767));
    });

    it("cuts cells to Excel limit of 32767 chars", async () => {
        const [sheet] = await sheetsFor([
            { title: "s", headers: ["N"], rows: [["x".repeat(40_000)]] },
        ]);
        expect(sheet.data[1][0]).toBe("x".repeat(32_767));
    });
});
