import type { ExportDocument, ExportSection } from "../../src/utils/export/types";

/** Two sections with cells that need escaping in every text format. */
export const exportDocumentFixture: ExportDocument = {
    title: "my-app",
    sectionHeader: "Section",
    sections: [
        {
            title: "Deps",
            headers: ["Name", "Note"],
            rows: [
                ["vue", 'say "hi", a|b'],
                ["zod", "line1\nline2"],
            ],
        },
        {
            title: "Dev Deps",
            headers: ["Name", "Note"],
            rows: [["vite", "<b>&</b>"]],
        },
    ],
};

/** Document of `sections` with placeholder title and section header. */
export function exportDocumentWith(sections: ExportSection[], title = "t"): ExportDocument {
    return { title, sectionHeader: "S", sections };
}
