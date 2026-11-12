import type { ExportDocument } from "../../src/utils/export/types";

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
