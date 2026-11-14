import { describe, it, expect } from "vitest";
import { csvExporter } from "../../../../src/core/export/exporters/csv";
import { exportDocumentFixture, exportDocumentWith } from "../../../fixtures/exportDocument";
import type { ExportDocument } from "../../../../src/core/export/types";

async function csvText(doc: ExportDocument) {
    const blob = await csvExporter.render(doc);
    return new TextDecoder("utf-8", { ignoreBOM: true }).decode(await blob.arrayBuffer());
}

describe("csvExporter", () => {
    it("writes BOM, one header row, section column, RFC 4180 quoting, CRLF", async () => {
        const text = await csvText(exportDocumentFixture);
        expect(text).toBe(
            "\ufeffSection,Name,Note\r\n" +
                'Deps,vue,"say ""hi"", a|b"\r\n' +
                'Deps,zod,"line1\nline2"\r\n' +
                "Dev Deps,vite,<b>&</b>\r\n",
        );
    });

    it("repeats header row when section headers change", async () => {
        const text = await csvText(
            exportDocumentWith([
                { title: "A", headers: ["Name"], rows: [["a"]] },
                { title: "B", headers: ["Name", "Extra"], rows: [["b", "1"]] },
            ]),
        );
        expect(text).toBe("\ufeffS,Name\r\nA,a\r\nS,Name,Extra\r\nB,b,1\r\n");
    });

    it("neutralizes formula cells, keeps lone dash", async () => {
        const text = await csvText(
            exportDocumentWith([
                { title: "A", headers: ["N"], rows: [["=1+1"], ["@x"], ["-1"], ["-"]] },
            ]),
        );
        expect(text).toBe("\ufeffS,N\r\nA,'=1+1\r\nA,'@x\r\nA,'-1\r\nA,-\r\n");
    });

    it("neutralizes plus, tab and CR formula starts", async () => {
        const text = await csvText(
            exportDocumentWith([{ title: "A", headers: ["N"], rows: [["+1"], ["\tx"], ["\rx"]] }]),
        );
        expect(text).toBe("\ufeffS,N\r\nA,'+1\r\nA,'\tx\r\nA,\"'\rx\"\r\n");
    });

    it("neutralizes formula starts after semicolons", async () => {
        const text = await csvText(
            exportDocumentWith([
                { title: "A", headers: ["N"], rows: [["x;=1+1;y"], ["a;@b;-c;+d"], ["a;-"]] },
            ]),
        );
        expect(text).toBe("\ufeffS,N\r\nA,x;'=1+1;y\r\nA,a;'@b;'-c;'+d\r\nA,a;-\r\n");
    });

    it("sets CSV MIME type", async () => {
        const blob = await csvExporter.render(exportDocumentFixture);
        expect(blob.type).toBe("text/csv;charset=utf-8");
    });
});
