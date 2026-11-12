import type { ExportDocument, ExportFormat } from "../types";

/** Lets Excel detect UTF-8 instead of guessing the system code page. */
const UTF8_BOM = "﻿";
const CSV_LINE_END = "\r\n";
const CSV_NEEDS_QUOTES = /[",\r\n]/;
/**
 * Spreadsheets run a cell starting with one of these as a formula; cell text
 * comes from package metadata anyone can publish. A lone "-" (MISSING_VALUE)
 * stays as is: no formula can follow it.
 */
const CSV_FORMULA_START = /^([=+@\t\r]|-.)/s;

function csvField(value: string): string {
    const safe = CSV_FORMULA_START.test(value) ? `'${value}` : value;
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
    let text = UTF8_BOM;
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
    return new Blob([text], { type: csvExporter.mimeType });
}

export const csvExporter: ExportFormat = {
    id: "csv",
    extension: "csv",
    mimeType: "text/csv;charset=utf-8",
    render: renderCsv,
};
