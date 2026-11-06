import { jsPDF } from "jspdf";
import { autoTable } from "jspdf-autotable";
import { pdfText } from "../export/exporters/pdf";
import type { Report, ReportBlock } from "./types";

/** Page layout in millimeters (jsPDF default unit). */
const PDF_MARGIN = 15;
const PDF_BLOCK_GAP = 3;
const PDF_LIST_INDENT = 4;
const PDF_LIST_MARK = "-";
const MM_PER_POINT = 25.4 / 72;
/** Font sizes in points, indexed by heading level. */
const PDF_HEADING_FONT_SIZES = { 1: 18, 2: 14, 3: 11 };
const PDF_TEXT_FONT_SIZE = 9;
const PDF_TABLE_FONT_SIZE = 8;
/** Header fill, RGB. */
const PDF_HEAD_FILL: [number, number, number] = [60, 60, 60];
const PDF_FONT = "helvetica";

/**
 * Portrait PDF: blocks flow top to bottom, a new page starts when the next
 * line does not fit. Tables break across pages and repeat their header.
 */
export function renderReportPdf(report: Report): Blob {
    const pdf = new jsPDF();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const textWidth = pageWidth - 2 * PDF_MARGIN;
    let y = PDF_MARGIN;

    function writeLines(text: string, fontSize: number, indent = 0, mark = "") {
        pdf.setFontSize(fontSize);
        const lineHeight = fontSize * MM_PER_POINT * pdf.getLineHeightFactor();
        const lines: string[] = pdf.splitTextToSize(pdfText(text), textWidth - indent);
        lines.forEach((line, index) => {
            if (y + lineHeight > pageHeight - PDF_MARGIN) {
                pdf.addPage();
                y = PDF_MARGIN;
            }
            y += lineHeight;
            if (index === 0 && mark) {
                pdf.text(mark, PDF_MARGIN + indent - PDF_LIST_INDENT, y);
            }
            pdf.text(line, PDF_MARGIN + indent, y);
        });
    }

    function writeBlock(block: ReportBlock) {
        switch (block.kind) {
            case "heading":
                pdf.setFont(PDF_FONT, "bold");
                writeLines(block.text, PDF_HEADING_FONT_SIZES[block.level]);
                pdf.setFont(PDF_FONT, "normal");
                break;
            case "paragraph":
                writeLines(block.text, PDF_TEXT_FONT_SIZE);
                break;
            case "list":
                for (const item of block.items) {
                    writeLines(item, PDF_TEXT_FONT_SIZE, PDF_LIST_INDENT, PDF_LIST_MARK);
                }
                break;
            case "table":
                autoTable(pdf, {
                    head: [block.headers.map(pdfText)],
                    body: block.rows.map((row) => row.map(pdfText)),
                    startY: y,
                    margin: PDF_MARGIN,
                    styles: { fontSize: PDF_TABLE_FONT_SIZE },
                    headStyles: { fillColor: PDF_HEAD_FILL },
                    // Last call runs on the table's last page, cursor under its last row.
                    didDrawPage: ({ cursor }) => {
                        y = cursor?.y ?? y;
                    },
                });
                break;
        }
        y += PDF_BLOCK_GAP;
    }

    pdf.setFont(PDF_FONT, "normal");
    report.blocks.forEach(writeBlock);
    return pdf.output("blob");
}
