import type { Report } from "../../src/core/report/types";

/** One block of each kind, with text that needs escaping in Markdown. */
export const reportFixture: Report = {
    title: "Dependency report: my-app",
    blocks: [
        { kind: "heading", level: 1, text: "Dependency report: my-app" },
        { kind: "paragraph", text: "Open / (open + closed) <b>" },
        { kind: "heading", level: 3, text: "Over 1 year" },
        { kind: "list", items: ["left-pad 1.2.0 (License: MIT)", "a|b"] },
        { kind: "table", headers: ["Preset", "Deps"], rows: [["Unknown", "1 (50%)"]] },
    ],
};
