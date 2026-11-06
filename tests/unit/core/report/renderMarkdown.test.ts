import { describe, it, expect } from "vitest";
import { renderReportMarkdown } from "../../../../src/core/report/renderMarkdown";
import type { Report } from "../../../../src/core/report/types";
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

    it("escapes block markers at line start of list items + paragraphs", () => {
        const report: Report = {
            title: "x",
            blocks: [
                { kind: "paragraph", text: "# not heading" },
                {
                    kind: "list",
                    items: [
                        "# h",
                        "- nested",
                        "+ nested",
                        "--- rule",
                        "1. ordered",
                        "2) ordered",
                        "      code",
                    ],
                },
            ],
        };
        expect(renderReportMarkdown(report)).toBe(
            [
                "\\# not heading",
                "",
                "- \\# h",
                "- \\- nested",
                "- \\+ nested",
                "- \\--- rule",
                "- 1\\. ordered",
                "- 2\\) ordered",
                "- code",
                "",
            ].join("\n"),
        );
    });
});
