import { describe, it, expect } from "vitest";
import { renderReportMarkdown } from "../../../../src/core/report/renderMarkdown";
import { reportFixture } from "../../../fixtures/report";

describe("renderReportMarkdown", () => {
    it("writes headings, paragraphs, lists, GFM tables with escaped text", () => {
        expect(renderReportMarkdown(reportFixture)).toBe(
            [
                "# Dependency report: my-app",
                "",
                "Open / (open + closed) \\<b\\>",
                "",
                "### Over 1 year",
                "",
                "- left-pad 1.2.0 (License: MIT)",
                "- a\\|b",
                "",
                "| Preset | Deps |",
                "| --- | --- |",
                "| Unknown | 1 (50%) |",
                "",
            ].join("\n"),
        );
    });
});
