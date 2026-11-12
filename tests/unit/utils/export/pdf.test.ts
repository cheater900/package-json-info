import { describe, it, expect } from "vitest";
import { pdfExporter } from "../../../../src/utils/export/exporters/pdf";
import { exportDocumentFixture } from "../../../fixtures/exportDocument";
import type { ExportDocument } from "../../../../src/utils/export/types";

/** PDF file text; built-in fonts write Latin-1 bytes. */
async function pdfSource(exportDocument: ExportDocument) {
    const blob = await pdfExporter.render(exportDocument);
    return new TextDecoder("latin1").decode(await blob.arrayBuffer());
}

describe("pdfExporter", () => {
    it("returns PDF blob", async () => {
        const blob = await pdfExporter.render(exportDocumentFixture);
        expect(blob.type).toBe("application/pdf");
        expect(await pdfSource(exportDocumentFixture)).toMatch(/^%PDF/);
    });

    it("puts each section on own page", async () => {
        const text = await pdfSource(exportDocumentFixture);
        expect(text.match(/\/Type \/Page\b(?!s)/g)).toHaveLength(2);
    });

    it('prints "?" for character outside built-in font', async () => {
        const text = await pdfSource({ ...exportDocumentFixture, title: "MIT ⚠ é" });
        expect(text).toContain("(MIT ? \xe9)");
    });
});
