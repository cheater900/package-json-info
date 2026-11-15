import type { ExportDocument, ExportFormat } from "../types";

/** Lets Excel detect UTF-8 instead of guessing the system code page. */
const CSV_UTF8_BOM = "\uFEFF";
const CSV_MIME_TYPE = "text/csv;charset=utf-8";
const CSV_LINE_END = "\r\n";
const CSV_NEEDS_QUOTES = /[",\r\n]/;
/**
 * Spreadsheets run a cell starting with one of these as a formula; cell text
 * comes from package metadata anyone can publish. A lone "-" (MISSING_VALUE)
 * stays as is: no formula can follow it. Excel in locales whose list
 * separator is ";" (de, fr, nl, ...) splits lines at every ";", quoted or
 * not, so a formula start after ";" opens a cell too: "x;=HYPERLINK(...);"
 * would run.
 */
const CSV_FORMULA_START = /(^|;)(?=[=+@\t\r]|-.)/gs;

function csvField(value: string): string {
    const safe = value.replace(CSV_FORMULA_START, "$1'");
    if (!CSV_NEEDS_QUOTES.test(safe)) {
        return safe;
    }
    return `"${safe.replaceAll('"', '""')}"`;
}

function csvLine(values: string[]): string {
    return values.map(csvField).join(",") + CSV_LINE_END;
}

/** RFC 4180 CSV: all sections in one table, a leading column naming each row's section. */
function renderCsv(exportDocument: ExportDocument): Blob {
    let text = CSV_UTF8_BOM;
    let previousHeaders = "";
    for (const section of exportDocument.sections) {
        const headers = csvLine([exportDocument.sectionHeader, ...section.headers]);
        if (headers !== previousHeaders) {
            text += headers;
            previousHeaders = headers;
        }
        for (const row of section.rows) {
            text += csvLine([section.title, ...row]);
        }
    }
    return new Blob([text], { type: CSV_MIME_TYPE });
}

export const csvExporter: ExportFormat = {
    id: "csv",
    extension: "csv",
    render: renderCsv,
};
