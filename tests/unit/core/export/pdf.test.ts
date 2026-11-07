import { describe, it, expect } from "vitest";
import { pdfExporter } from "../../../../src/core/export/exporters/pdf";
import { exportDocumentFixture } from "../../../fixtures/exportDocument";
import type { ExportDocument } from "../../../../src/core/export/types";
import { pdfBlobText, pdfPageCount } from "../../../helpers/pdf";

async function pdfSource(exportDocument: ExportDocument) {
    return pdfBlobText(await pdfExporter.render(exportDocument));
}

describe("pdfExporter", () => {
    it("returns PDF blob", async () => {
        const blob = await pdfExporter.render(exportDocumentFixture);
        expect(blob.type).toBe("application/pdf");
        expect(await pdfSource(exportDocumentFixture)).toMatch(/^%PDF/);
    });

    it("puts each section on own page", async () => {
        const text = await pdfSource(exportDocumentFixture);
        expect(pdfPageCount(text)).toBe(2);
    });

    it('prints "?" for character outside built-in font', async () => {
        const text = await pdfSource({ ...exportDocumentFixture, title: "MIT ⚠ é" });
        expect(text).toContain("(MIT ? \xe9)");
    });
});
