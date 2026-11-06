/** One piece of report content; text is plain, already translated, never markup. */
export type ReportBlock =
    | { kind: "heading"; level: 1 | 2 | 3; text: string }
    | { kind: "paragraph"; text: string }
    | { kind: "list"; items: string[] }
    | { kind: "table"; headers: string[]; rows: string[][] };

/**
 * Format-neutral report. Renderers read only these strings, never domain
 * rows, i18n or Vue, so each format and the CLI stay independent.
 */
export type Report = {
    title: string;
    blocks: ReportBlock[];
};
