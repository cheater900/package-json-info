import { markdownCell, markdownRow } from "../export/exporters/markdown";
import type { Report, ReportBlock } from "./types";

function blockMarkdown(block: ReportBlock): string {
    switch (block.kind) {
        case "heading":
            return `${"#".repeat(block.level)} ${markdownCell(block.text)}`;
        case "paragraph":
            return markdownCell(block.text);
        case "list":
            return block.items.map((item) => `- ${markdownCell(item)}`).join("\n");
        case "table":
            return [
                markdownRow(block.headers),
                markdownRow(block.headers.map(() => "---")),
                ...block.rows.map(markdownRow),
            ].join("\n");
    }
}

/** GFM text of `report`, blocks separated by a blank line; all text escaped to render literally. */
export function renderReportMarkdown(report: Report): string {
    return report.blocks.map(blockMarkdown).join("\n\n") + "\n";
}
