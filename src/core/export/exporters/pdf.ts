import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { ExportDocument, ExportFormat } from "../types";

/** Page layout in millimeters (jsPDF default unit). */
const PDF_MARGIN = 10;
const PDF_TITLE_Y = 15;
const PDF_HEADING_GAP = 8;
const PDF_TABLE_GAP = 4;
/** Font sizes in points; table text stays small so many columns fit a landscape page. */
const PDF_TITLE_FONT_SIZE = 16;
const PDF_HEADING_FONT_SIZE = 12;
const PDF_TABLE_FONT_SIZE = 7;
/** Header fill, RGB. */
export const PDF_HEAD_FILL: [number, number, number] = [60, 60, 60];

/**
 * Built-in PDF fonts encode WinAnsi only: Latin-1 plus these extras. jsPDF
 * prints any other character as a wrong glyph ("⚠" -> "&"), so those become
 * PDF_UNSUPPORTED_MARK instead.
 */
const PDF_UNSUPPORTED_CHARS = /[^\t\n\r -\u00FF€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ]/gu;
const PDF_UNSUPPORTED_MARK = "?";

export function pdfText(value: string): string {
    return value.replace(PDF_UNSUPPORTED_CHARS, PDF_UNSUPPORTED_MARK);
}

/**
 * Landscape PDF: title, then a heading and table per section, each section
 * on its own page. Columns past the page width continue on the next page,
 * repeating the first column.
 */
function renderPdf(exportDocument: ExportDocument): Blob {
    const pdf = new jsPDF({ orientation: "landscape" });
    pdf.setFontSize(PDF_TITLE_FONT_SIZE);
    pdf.text(pdfText(exportDocument.title), PDF_MARGIN, PDF_TITLE_Y);
    exportDocument.sections.forEach((section, index) => {
        let headingY = PDF_TITLE_Y + PDF_HEADING_GAP;
        if (index > 0) {
            pdf.addPage();
            headingY = PDF_TITLE_Y;
        }
        pdf.setFontSize(PDF_HEADING_FONT_SIZE);
        pdf.text(pdfText(section.title), PDF_MARGIN, headingY);
        autoTable(pdf, {
            head: [section.headers.map(pdfText)],
            body: section.rows.map((row) => row.map(pdfText)),
            startY: headingY + PDF_TABLE_GAP,
            margin: PDF_MARGIN,
            styles: { fontSize: PDF_TABLE_FONT_SIZE },
            headStyles: { fillColor: PDF_HEAD_FILL },
            horizontalPageBreak: true,
            horizontalPageBreakRepeat: 0,
        });
    });
    return pdf.output("blob");
}

export const pdfExporter: ExportFormat = {
    id: "pdf",
    extension: "pdf",
    render: renderPdf,
};
