import { markdownCell, markdownRow } from "../export/exporters/markdown";
import type { Report, ReportBlock } from "./types";

/**
 * Line starts that open a heading, list, thematic break or code block; inside a
 * list item or paragraph they would turn untrusted text into structure.
 */
const MARKDOWN_BLOCK_START = /^(?:[#+-]|(\d+)([.)]))/;

/** Text of one block line, escaped as a cell plus its leading block marker. */
function markdownLine(value: string): string {
    return markdownCell(value.trimStart()).replace(
        MARKDOWN_BLOCK_START,
        (marker: string, digits?: string, delimiter?: string) =>
            digits ? `${digits}\\${delimiter}` : `\\${marker}`,
    );
}

function blockMarkdown(block: ReportBlock): string {
    switch (block.kind) {
        case "heading":
            return `${"#".repeat(block.level)} ${markdownCell(block.text)}`;
        case "paragraph":
            return markdownLine(block.text);
        case "list":
            return block.items.map((item) => `- ${markdownLine(item)}`).join("\n");
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
