import type { ExportDocument, ExportFormat } from "../types";

const MARKDOWN_MIME_TYPE = "text/markdown;charset=utf-8";
const MARKDOWN_LINE_BREAKS = /\r\n|\r|\n/g;
/**
 * Backslash-escaped so untrusted cell text renders literally: no raw HTML
 * (`<`), link or image (`[`), entity (`&`), emphasis or code span, and no
 * `\\|` that unescapes a pipe and breaks out of the cell.
 */
const MARKDOWN_SPECIAL_CHARS = /[\\`*_~[\]<>|&]/g;

/** Keeps a cell on one table line, inside its column, as plain text. */
function markdownCell(value: string): string {
    return value.replace(MARKDOWN_LINE_BREAKS, " ").replace(MARKDOWN_SPECIAL_CHARS, "\\$&");
}

function markdownRow(values: string[]): string {
    return `| ${values.map(markdownCell).join(" | ")} |`;
}

/** `# title`, then `## section` and a GFM table per section. */
function renderMarkdown(exportDocument: ExportDocument): Blob {
    const lines = [`# ${markdownCell(exportDocument.title)}`];
    for (const section of exportDocument.sections) {
        lines.push(
            "",
            `## ${markdownCell(section.title)}`,
            "",
            markdownRow(section.headers),
            markdownRow(section.headers.map(() => "---")),
            ...section.rows.map(markdownRow),
        );
    }
    return new Blob([lines.join("\n") + "\n"], { type: MARKDOWN_MIME_TYPE });
}

export const markdownExporter: ExportFormat = {
    id: "markdown",
    extension: "md",
    render: renderMarkdown,
};
