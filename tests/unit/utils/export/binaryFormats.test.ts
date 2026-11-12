import { describe, it, expect } from "vitest";
import { pdfExporter } from "../../../../src/utils/export/exporters/pdf";
import { xlsxExporter } from "../../../../src/utils/export/exporters/xlsx";
import { exportDocumentFixture } from "../../../fixtures/exportDocument";

async function leadingText(blob: Blob, length: number) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return String.fromCharCode(...bytes.slice(0, length));
}

describe("xlsxExporter", () => {
    it("returns ZIP blob", async () => {
        const blob = await xlsxExporter.render(exportDocumentFixture);
        expect(blob.size).toBeGreaterThan(0);
        expect(await leadingText(blob, 2)).toBe("PK");
    });
});

describe("pdfExporter", () => {
    it("returns PDF blob", async () => {
        const blob = await pdfExporter.render(exportDocumentFixture);
        expect(blob.type).toBe("application/pdf");
        expect(await leadingText(blob, 4)).toBe("%PDF");
    });

    it('prints "?" for character outside built-in font', async () => {
        const blob = await pdfExporter.render({ ...exportDocumentFixture, title: "MIT ⚠ é" });
        const text = new TextDecoder("latin1").decode(await blob.arrayBuffer());
        expect(text).toContain("(MIT ? \xe9)");
    });
});
