import type { ExportDocument, ExportFormat } from "../types";

const HTML_ESCAPES: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
};

/** Inline so the file opens offline with no external request. */
const HTML_STYLE = `
body { color: #1a1a1a; font-family: system-ui, sans-serif; margin: 24px; }
table { border-collapse: collapse; font-size: 13px; margin-bottom: 32px; }
th, td { border: 1px solid #c8c8c8; padding: 4px 8px; text-align: left; vertical-align: top; }
th { background: #f0f0f0; }
tbody tr:nth-child(even) { background: #fafafa; }
`;

function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

function htmlCells(tag: "th" | "td", values: string[]): string {
    const scope = tag === "th" ? ' scope="col"' : "";
    return values.map((value) => `<${tag}${scope}>${escapeHtml(value)}</${tag}>`).join("");
}

/** Standalone HTML page: inline style, no scripts, no external links. */
function renderHtml(exportDocument: ExportDocument): Blob {
    const title = escapeHtml(exportDocument.title);
    const sections = exportDocument.sections.map(
        (section) =>
            `<h2>${escapeHtml(section.title)}</h2>\n` +
            `<table>\n<thead><tr>${htmlCells("th", section.headers)}</tr></thead>\n<tbody>\n` +
            section.rows.map((row) => `<tr>${htmlCells("td", row)}</tr>\n`).join("") +
            "</tbody>\n</table>",
    );
    const html = [
        "<!doctype html>",
        "<html>",
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        `<title>${title}</title>`,
        `<style>${HTML_STYLE}</style>`,
        "</head>",
        "<body>",
        `<h1>${title}</h1>`,
        ...sections,
        "</body>",
        "</html>",
        "",
    ].join("\n");
    return new Blob([html], { type: htmlExporter.mimeType });
}

export const htmlExporter: ExportFormat = {
    id: "html",
    extension: "html",
    mimeType: "text/html;charset=utf-8",
    render: renderHtml,
};
