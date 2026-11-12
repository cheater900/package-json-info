import { describe, it, expect } from "vitest";
import { EXPORTERS } from "../../../../src/utils/export";
import { exportDocumentFixture } from "../../../fixtures/exportDocument";

describe("EXPORTERS", () => {
    it("lists formats in button order with translated labels", () => {
        expect(EXPORTERS.map((e) => e.label)).toEqual(["CSV", "XLSX", "Markdown", "HTML", "PDF"]);
    });

    it("has unique ids and extensions", () => {
        expect(new Set(EXPORTERS.map((e) => e.id)).size).toBe(EXPORTERS.length);
        expect(new Set(EXPORTERS.map((e) => e.extension)).size).toBe(EXPORTERS.length);
    });

    it.each(EXPORTERS.map((e) => [e.id, e] as const))(
        "%s renders fixture to non-empty blob",
        async (_id, exporter) => {
            const blob = await exporter.render(exportDocumentFixture);
            expect(blob.size).toBeGreaterThan(0);
        },
    );
});
