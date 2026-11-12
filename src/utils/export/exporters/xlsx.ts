import writeExcelFile from "write-excel-file/browser";
import type { SheetData } from "write-excel-file/browser";
import type { ExportDocument, ExportFormat } from "../types";

/** Excel rejects sheet names over 31 characters or holding any of `\ / ? * [ ] :`. */
const SHEET_NAME_MAX_LENGTH = 31;
const SHEET_NAME_FORBIDDEN = /[\\/?*[\]:]/g;
/** Column width bounds, in characters. */
const COLUMN_WIDTH_MIN = 8;
const COLUMN_WIDTH_MAX = 60;

function sheetName(title: string): string {
    return title.replace(SHEET_NAME_FORBIDDEN, " ").slice(0, SHEET_NAME_MAX_LENGTH);
}

function columnWidths(headers: string[], rows: string[][]) {
    return headers.map((header, index) => {
        const longest = Math.max(header.length, ...rows.map((row) => row[index]?.length ?? 0));
        return { width: Math.min(Math.max(longest, COLUMN_WIDTH_MIN), COLUMN_WIDTH_MAX) };
    });
}

/** One sheet per section, bold frozen header row. */
function renderXlsx(exportDocument: ExportDocument): Promise<Blob> {
    const sheets = exportDocument.sections.map((section) => {
        const data: SheetData = [
            section.headers.map((header) => ({ value: header, fontWeight: "bold" as const })),
            ...section.rows,
        ];
        return {
            data,
            sheet: sheetName(section.title),
            columns: columnWidths(section.headers, section.rows),
            stickyRowsCount: 1,
        };
    });
    return writeExcelFile(sheets).toBlob();
}

export const xlsxExporter: ExportFormat = {
    id: "xlsx",
    extension: "xlsx",
    render: renderXlsx,
};
