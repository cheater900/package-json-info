import { describe, it, expect } from "vitest";
import {
    REPORT_COLUMN_KEYS,
    buildReport,
    reportFileBaseName,
} from "../../../../src/core/report/buildReport";
import type { ReportInput } from "../../../../src/core/report/buildReport";
import { renderReportMarkdown } from "../../../../src/core/report/renderMarkdown";
import type { Report, ReportBlock } from "../../../../src/core/report/types";
import { HEALTH_BAND_FAIR_MIN, HEALTH_BAND_GOOD_MIN } from "../../../../src/core/constants";
import { HEALTH_FILTER_SECTIONS } from "../../../../src/core/utils/healthFilters";
import { t } from "../../../../src/core/i18n";
import en from "../../../../src/core/i18n/locales/en.json" with { type: "json" };
import { fullDependency, sparseDependency } from "../../../fixtures/dependencies";

const NOW = new Date("2026-11-12T00:00:00.000Z");
/** Words that advise instead of state facts. */
const ADVICE_WORDS =
    /\b(should|must|ought|recommend\w*|consider\w*|suggest\w*|advise\w*|need\w*|risk\w*|remov\w*|upgrad\w*|replac\w*|avoid\w*|switch\w*|warn\w*|concern\w*)\b/i;

const errorRow = { name: "broken", version: "1.0.0", error: "boom" };

function inputWith(overrides: Partial<ReportInput> = {}): ReportInput {
    return {
        title: "my-app",
        tables: [
            {
                id: "deps",
                title: "Deps",
                dependencies: [fullDependency, sparseDependency, errorRow],
            },
            {
                id: "devDeps",
                title: "Dev Deps",
                dependencies: [{ ...fullDependency, name: "vite" }],
            },
        ],
        searchQuery: "",
        healthFilters: {},
        ...overrides,
    };
}

/** Blocks after the level-2 heading `title`, up to the next level-2 heading. */
function sectionOf(report: Report, title: string): ReportBlock[] {
    const start = report.blocks.findIndex(
        (block) => block.kind === "heading" && block.level === 2 && block.text === title,
    );
    expect(start).toBeGreaterThan(-1);
    const rest = report.blocks.slice(start + 1);
    const end = rest.findIndex((block) => block.kind === "heading" && block.level === 2);
    return end === -1 ? rest : rest.slice(0, end);
}

function presetRow(report: Report, sectionId: string, presetId: string): string[] | undefined {
    const table = sectionOf(report, t(`filters.sections.${sectionId}`)).find(
        (block) => block.kind === "table",
    );
    const label = t(`filters.presets.${sectionId}.${presetId}`);
    return table?.kind === "table" ? table.rows.find((row) => row[0] === label) : undefined;
}

function listItems(blocks: ReportBlock[]): string[] {
    return blocks.flatMap((block) => (block.kind === "list" ? block.items : []));
}

function stringsOf(tree: unknown): string[] {
    return typeof tree === "string" ? [tree] : Object.values(tree as object).flatMap(stringsOf);
}

describe("buildReport", () => {
    it("starts with title heading", () => {
        const report = buildReport(inputWith(), NOW);
        expect(report.title).toBe("Dependency report: my-app");
        expect(report.blocks[0]).toEqual({ kind: "heading", level: 1, text: report.title });
    });

    it("covers every filter section + preset", () => {
        const report = buildReport(inputWith(), NOW);
        for (const section of HEALTH_FILTER_SECTIONS) {
            for (const preset of section.presets) {
                expect(presetRow(report, section.id, preset.id)).toBeDefined();
            }
        }
    });

    it("defines every filter section", () => {
        const report = buildReport(inputWith(), NOW);
        for (const section of HEALTH_FILTER_SECTIONS) {
            const [definition] = sectionOf(report, t(`filters.sections.${section.id}`));
            expect(definition).toEqual({ kind: "paragraph", text: expect.any(String) });
            expect(definition.kind === "paragraph" && definition.text).not.toMatch(
                /^report\.definitions|\{\w+\}/,
            );
        }
    });

    it("counts stale rows per table in coverage", () => {
        const stale = { ...fullDependency, staleSince: "2026-11-01T00:00:00.000Z" };
        const report = buildReport(
            inputWith({
                tables: [
                    { id: "deps", title: "Deps", dependencies: [stale, fullDependency, errorRow] },
                ],
            }),
            NOW,
        );
        const [table] = sectionOf(report, "Data coverage");
        expect(table).toMatchObject({ kind: "table", rows: [["Deps", "3", "2", "1", "1"]] });
    });

    it("counts preset matches per table with share of fetched rows", () => {
        const report = buildReport(inputWith(), NOW);
        expect(presetRow(report, "lastPublished", "over1Year")).toEqual([
            "Over 1 year",
            "1 (50%)",
            "1 (100%)",
        ]);
        expect(presetRow(report, "lastPublished", "unknown")).toEqual([
            "Unknown",
            "1 (50%)",
            "0 (0%)",
        ]);
    });

    it("marks bundle size of dev dependencies as not measured", () => {
        const report = buildReport(inputWith(), NOW);
        expect(presetRow(report, "bundleSize", "unknown")).toEqual(["Unknown", "1 (50%)", "-"]);
    });

    it("lists matching packages under preset heading with values", () => {
        const blocks = sectionOf(buildReport(inputWith(), NOW), "Last published");
        expect(blocks).toContainEqual({ kind: "heading", level: 3, text: "Over 1 year" });
        expect(listItems(blocks)).toContain("left-pad 1.2.0 (Latest release date: 2021-01-01)");
        expect(listItems(blocks)).toContain("vite 1.2.0 (Latest release date: 2021-01-01)");
    });

    it("skips heading of preset without matches", () => {
        const blocks = sectionOf(buildReport(inputWith(), NOW), "Last published");
        expect(blocks).not.toContainEqual({ kind: "heading", level: 3, text: "Within 1 month" });
    });

    it("prints bare health score under band heading", () => {
        const blocks = sectionOf(buildReport(inputWith(), NOW), "Health score");
        expect(blocks).toContainEqual({ kind: "heading", level: 3, text: "Fair" });
        expect(listItems(blocks)).toContain("left-pad 1.2.0 (Health: 55)");
    });

    it("lists commit count with commit activity", () => {
        const row = { ...fullDependency, commitsLastYear: 0 };
        const report = buildReport(
            inputWith({ tables: [{ id: "deps", title: "Deps", dependencies: [row] }] }),
            NOW,
        );
        expect(listItems(sectionOf(report, "Commit activity"))).toContain(
            "left-pad 1.2.0 (Last commit: -; Commits in window: 0)",
        );
    });

    it('shows "?" for commit count when commit lookup failed', () => {
        const row = { ...fullDependency, failedLookups: { lastCommitDate: "timeout" } };
        const report = buildReport(
            inputWith({ tables: [{ id: "deps", title: "Deps", dependencies: [row] }] }),
            NOW,
        );
        expect(listItems(sectionOf(report, "Commit activity"))).toContain(
            "left-pad 1.2.0 (Last commit: ?; Commits in window: ?)",
        );
    });

    it("quotes deprecation message + shows license without warning mark", () => {
        const row = { ...fullDependency, deprecated: "use other-pad", license: "GPL-3.0" };
        const report = buildReport(
            inputWith({ tables: [{ id: "deps", title: "Deps", dependencies: [row] }] }),
            NOW,
        );
        expect(listItems(sectionOf(report, "Status")).join("\n")).toContain(
            'Deprecated: "use other-pad"',
        );
        expect(listItems(sectionOf(report, "License"))).toContain(
            "left-pad 1.2.0 (License: GPL-3.0)",
        );
    });

    it('shows "?" for failed lookup', () => {
        const row = { ...fullDependency, license: null, failedLookups: { license: "timeout" } };
        const report = buildReport(
            inputWith({ tables: [{ id: "deps", title: "Deps", dependencies: [row] }] }),
            NOW,
        );
        expect(listItems(sectionOf(report, "License"))).toContain("left-pad 1.2.0 (License: ?)");
        const coverage = sectionOf(report, "Data coverage");
        expect(coverage).toContainEqual({
            kind: "table",
            headers: ["Field", "Deps"],
            rows: [["License", "1"]],
        });
    });

    it("counts failed lookups per table in coverage", () => {
        const failed = { ...fullDependency, failedLookups: { license: "timeout" } };
        const report = buildReport(
            inputWith({
                tables: [
                    { id: "deps", title: "Deps", dependencies: [failed, failed] },
                    { id: "devDeps", title: "Dev Deps", dependencies: [fullDependency] },
                ],
            }),
            NOW,
        );
        expect(sectionOf(report, "Data coverage")).toContainEqual({
            kind: "table",
            headers: ["Field", "Deps", "Dev Deps"],
            rows: [["License", "2", "0"]],
        });
    });

    it("lists fetch errors in coverage, not in sections", () => {
        const report = buildReport(inputWith(), NOW);
        const coverage = sectionOf(report, "Data coverage");
        expect(listItems(coverage)).toEqual(["Deps: broken 1.0.0: boom"]);
        expect(coverage[0]).toEqual({
            kind: "table",
            headers: ["Table", "Packages", "Fetched", "Fetch errors", "Stored values"],
            rows: [
                ["Deps", "3", "2", "1", "0"],
                ["Dev Deps", "1", "1", "0", "0"],
            ],
        });
        const sectionItems = HEALTH_FILTER_SECTIONS.flatMap((section) =>
            listItems(sectionOf(report, t(`filters.sections.${section.id}`))),
        );
        expect(sectionItems.some((item) => item.startsWith("broken"))).toBe(false);
    });

    it("applies search + filters and states them in overview", () => {
        const report = buildReport(
            inputWith({ searchQuery: " LEFT ", healthFilters: { vulnerabilities: "none" } }),
            NOW,
        );
        expect(listItems(sectionOf(report, "Overview"))).toEqual([
            "Generated: 2026-11-12T00:00:00.000Z",
            "Deps: 1 packages",
            "Dev Deps: 0 packages",
            'Name search: "LEFT"',
            "Active filters: Vulnerabilities: None",
        ]);
    });

    it('states "none" without search or filters', () => {
        const items = listItems(sectionOf(buildReport(inputWith(), NOW), "Overview"));
        expect(items).toContain("Name search: none");
        expect(items).toContain("Active filters: none");
    });

    it("quotes health band thresholds from constants", () => {
        const [definition] = sectionOf(buildReport(inputWith(), NOW), "Health score");
        expect(definition).toEqual({
            kind: "paragraph",
            text: expect.stringContaining(
                `Poor 0-${HEALTH_BAND_FAIR_MIN - 1}, Fair ${HEALTH_BAND_FAIR_MIN}-${HEALTH_BAND_GOOD_MIN - 1}, Good ${HEALTH_BAND_GOOD_MIN}-100`,
            ),
        });
    });

    it("holds no advice wording in report strings or output", () => {
        const strings = [...stringsOf(en.report), ...stringsOf(en.filters)];
        expect(strings.filter((text) => ADVICE_WORDS.test(text))).toEqual([]);
        expect(renderReportMarkdown(buildReport(inputWith(), NOW))).not.toMatch(ADVICE_WORDS);
    });
});

describe("REPORT_COLUMN_KEYS", () => {
    it("holds every column filter sections read", () => {
        const keys = HEALTH_FILTER_SECTIONS.flatMap((section) => section.columnKeys);
        expect(new Set(REPORT_COLUMN_KEYS)).toEqual(new Set(keys));
    });
});

describe("reportFileBaseName", () => {
    it("slugs title with report suffix", () => {
        expect(reportFileBaseName("@vue/test-utils")).toBe("vue-test-utils-report");
    });
});
