import type { ExportDocument, ExportFormat } from "../types";

const LINE_BREAKS = /\r\n|\r|\n/g;

/** Keeps a cell on one table line and inside its column. */
function markdownCell(value: string): string {
    return value.replace(LINE_BREAKS, " ").replaceAll("|", "\\|");
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
    return new Blob([lines.join("\n") + "\n"], { type: markdownExporter.mimeType });
}

export const markdownExporter: ExportFormat = {
    id: "markdown",
    extension: "md",
    mimeType: "text/markdown;charset=utf-8",
    render: renderMarkdown,
};
