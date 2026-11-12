import { describe, it, expect } from "vitest";
import { markdownExporter } from "../../../../src/utils/export/exporters/markdown";
import { exportDocumentFixture } from "../../../fixtures/exportDocument";

describe("markdownExporter", () => {
    it("writes title, section headings, GFM tables, escapes pipe and newline", async () => {
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
                "| vite | <b>&</b> |",
                "",
            ].join("\n"),
        );
    });
});
