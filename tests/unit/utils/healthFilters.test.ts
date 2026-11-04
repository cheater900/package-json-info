import { describe, it, expect } from "vitest";
import {
    HEALTH_FILTER_SECTIONS,
    activeHealthFilterCount,
    columnsForHealthFilters,
    filterRowsByHealth,
    rowMatchesHealthFilters,
    type HealthFilters,
} from "../../../src/utils/healthFilters";
import type { DependencyRow, PackageError, PackageInfo } from "../../../src/types";
import { fullDependency, sparseDependency } from "../../fixtures/dependencies";

const NOW = new Date(Date.UTC(2026, 5, 15, 12));

/** ISO time `months` calendar months before NOW, shifted by `offsetMs`. */
function ago(months: number, offsetMs = 0): string {
    return new Date(Date.UTC(2026, 5 - months, 15, 12) + offsetMs).toISOString();
}

function fullRow(overrides: Partial<PackageInfo> = {}): PackageInfo {
    return { ...fullDependency, ...overrides };
}

function sparseRow(overrides: Partial<PackageInfo> = {}): PackageInfo {
    return { ...sparseDependency, ...overrides };
}

function matchesPreset(
    sectionId: string,
    presetId: string,
    row: PackageInfo,
    listId: "deps" | "devDeps" = "deps",
): boolean {
    const filters = { [sectionId]: presetId } as HealthFilters;
    return rowMatchesHealthFilters(row, filters, NOW, listId);
}

type Case = [presetId: string, inside: Partial<PackageInfo>, outside: Partial<PackageInfo>];

const DATE_FIELDS = [
    ["lastPublished", "latestReleaseDate"],
    ["installedVersionAge", "versionDate"],
] as const;

describe.each(DATE_FIELDS)("%s presets", (sectionId, field) => {
    const cases: Case[] = [
        ["within1Month", { [field]: ago(1) }, { [field]: ago(1, -1) }],
        ["within6Months", { [field]: ago(6) }, { [field]: ago(6, -1) }],
        ["over1Year", { [field]: ago(12, -1) }, { [field]: ago(12) }],
        ["over2Years", { [field]: ago(24, -1) }, { [field]: ago(24) }],
        ["over3Years", { [field]: ago(36, -1) }, { [field]: ago(36) }],
    ];
    it.each(cases)("%s matches inside threshold only", (presetId, inside, outside) => {
        expect(matchesPreset(sectionId, presetId, fullRow(inside))).toBe(true);
        expect(matchesPreset(sectionId, presetId, fullRow(outside))).toBe(false);
    });
    it("matches unknown for null date only", () => {
        expect(matchesPreset(sectionId, "unknown", sparseRow())).toBe(true);
        expect(matchesPreset(sectionId, "unknown", fullRow({ [field]: ago(1) }))).toBe(false);
        expect(matchesPreset(sectionId, "within1Month", sparseRow())).toBe(false);
        expect(matchesPreset(sectionId, "over3Years", sparseRow())).toBe(false);
    });
});

describe("lastUpdated presets", () => {
    const cases: Case[] = [
        ["over1Year", { latestUpdateDate: ago(12, -1) }, { latestUpdateDate: ago(12) }],
        ["over2Years", { latestUpdateDate: ago(24, -1) }, { latestUpdateDate: ago(24) }],
    ];
    it.each(cases)("%s matches inside threshold only", (presetId, inside, outside) => {
        expect(matchesPreset("lastUpdated", presetId, fullRow(inside))).toBe(true);
        expect(matchesPreset("lastUpdated", presetId, fullRow(outside))).toBe(false);
    });
    it("matches unknown for null date only", () => {
        expect(matchesPreset("lastUpdated", "unknown", sparseRow())).toBe(true);
        expect(matchesPreset("lastUpdated", "over1Year", sparseRow())).toBe(false);
        expect(matchesPreset("lastUpdated", "unknown", fullRow())).toBe(false);
    });
});

describe("commitActivity presets", () => {
    it("matches commitsLastMonth at 1 month boundary", () => {
        expect(
            matchesPreset(
                "commitActivity",
                "commitsLastMonth",
                fullRow({ lastCommitDate: ago(1) }),
            ),
        ).toBe(true);
        expect(
            matchesPreset(
                "commitActivity",
                "commitsLastMonth",
                fullRow({ lastCommitDate: ago(1, -1) }),
            ),
        ).toBe(false);
    });
    it.each([
        ["noCommits3Months", 3],
        ["noCommits6Months", 6],
    ])("matches %s for old last commit or zero commits", (presetId, months) => {
        expect(
            matchesPreset("commitActivity", presetId, fullRow({ lastCommitDate: ago(months, -1) })),
        ).toBe(true);
        expect(
            matchesPreset("commitActivity", presetId, fullRow({ lastCommitDate: ago(months) })),
        ).toBe(false);
        expect(matchesPreset("commitActivity", presetId, fullRow({ commitsLastYear: 0 }))).toBe(
            true,
        );
        expect(matchesPreset("commitActivity", presetId, sparseRow())).toBe(false);
    });
    it("matches noCommits1Year for zero commits only", () => {
        expect(
            matchesPreset("commitActivity", "noCommits1Year", fullRow({ commitsLastYear: 0 })),
        ).toBe(true);
        expect(
            matchesPreset("commitActivity", "noCommits1Year", fullRow({ commitsLastYear: 1 })),
        ).toBe(false);
        expect(matchesPreset("commitActivity", "noCommits1Year", sparseRow())).toBe(false);
    });
    it("matches underOnePerMonth below 12 commits", () => {
        expect(
            matchesPreset("commitActivity", "underOnePerMonth", fullRow({ commitsLastYear: 11 })),
        ).toBe(true);
        expect(
            matchesPreset("commitActivity", "underOnePerMonth", fullRow({ commitsLastYear: 12 })),
        ).toBe(false);
        expect(matchesPreset("commitActivity", "underOnePerMonth", sparseRow())).toBe(false);
    });
    it("matches unknown for null commit count only", () => {
        expect(matchesPreset("commitActivity", "unknown", sparseRow())).toBe(true);
        expect(matchesPreset("commitActivity", "unknown", fullRow({ commitsLastYear: 0 }))).toBe(
            false,
        );
    });
});

describe.each([
    [
        "openPrRatio",
        "openPRs",
        "closedPRs",
        [
            ["under10", 8, 90, 10, 90],
            ["over25", 26, 74, 25, 75],
            ["over50", 51, 49, 50, 50],
            ["over75", 76, 24, 75, 25],
        ],
    ],
    [
        "openIssueRatio",
        "openIssues",
        "closedIssues",
        [
            ["under20", 19, 81, 20, 80],
            ["over40", 41, 59, 40, 60],
            ["over60", 61, 39, 60, 40],
            ["over80", 81, 19, 80, 20],
        ],
    ],
] as const)("%s presets", (sectionId, openField, closedField, thresholdRows) => {
    const thresholds: [string, number, number, number, number][] = thresholdRows.map((row) => [
        ...row,
    ]);
    const lowPreset = thresholds[0][0];
    it.each(thresholds)(
        "%s matches inside threshold only",
        (presetId, openIn, closedIn, openOut, closedOut) => {
            const inside = fullRow({ [openField]: openIn, [closedField]: closedIn });
            const outside = fullRow({ [openField]: openOut, [closedField]: closedOut });
            expect(matchesPreset(sectionId, presetId, inside)).toBe(true);
            expect(matchesPreset(sectionId, presetId, outside)).toBe(false);
        },
    );
    it("matches unknown for null count only", () => {
        expect(matchesPreset(sectionId, "unknown", sparseRow())).toBe(true);
        expect(
            matchesPreset(sectionId, "unknown", fullRow({ [openField]: 50, [closedField]: 50 })),
        ).toBe(false);
        expect(matchesPreset(sectionId, lowPreset, sparseRow())).toBe(false);
    });
    it("counts sample below 10 as unknown", () => {
        const small = fullRow({ [openField]: 0, [closedField]: 9 });
        expect(matchesPreset(sectionId, "unknown", small)).toBe(true);
        expect(matchesPreset(sectionId, lowPreset, small)).toBe(false);
        const enough = fullRow({ [openField]: 0, [closedField]: 10 });
        expect(matchesPreset(sectionId, "unknown", enough)).toBe(false);
        expect(matchesPreset(sectionId, lowPreset, enough)).toBe(true);
    });
});

describe("vulnerabilities presets", () => {
    it.each([
        ["none", 0, 1],
        ["any", 1, 0],
        ["atLeast3", 3, 2],
        ["atLeast10", 10, 9],
    ])("%s matches inside threshold only", (presetId, inside, outside) => {
        expect(
            matchesPreset("vulnerabilities", presetId, fullRow({ vulnerabilityCount: inside })),
        ).toBe(true);
        expect(
            matchesPreset("vulnerabilities", presetId, fullRow({ vulnerabilityCount: outside })),
        ).toBe(false);
    });
    it("matches unknown for null count only", () => {
        expect(matchesPreset("vulnerabilities", "unknown", sparseRow())).toBe(true);
        expect(matchesPreset("vulnerabilities", "none", sparseRow())).toBe(false);
        expect(matchesPreset("vulnerabilities", "any", sparseRow())).toBe(false);
    });
});

describe("bundleSize presets", () => {
    it.each([
        ["under5Kb", 5 * 1024 - 1, 5 * 1024],
        ["over25Kb", 25 * 1024 + 1, 25 * 1024],
        ["over50Kb", 50 * 1024 + 1, 50 * 1024],
        ["over100Kb", 100 * 1024 + 1, 100 * 1024],
        ["over250Kb", 250 * 1024 + 1, 250 * 1024],
    ])("%s matches inside threshold only", (presetId, inside, outside) => {
        expect(matchesPreset("bundleSize", presetId, fullRow({ bundleSizeGzip: inside }))).toBe(
            true,
        );
        expect(matchesPreset("bundleSize", presetId, fullRow({ bundleSizeGzip: outside }))).toBe(
            false,
        );
    });
    it("matches unknown for null size only", () => {
        expect(matchesPreset("bundleSize", "unknown", sparseRow())).toBe(true);
        expect(matchesPreset("bundleSize", "under5Kb", sparseRow())).toBe(false);
        expect(matchesPreset("bundleSize", "unknown", fullRow())).toBe(false);
    });
});

describe("healthScore presets", () => {
    it.each([
        ["poor", 39, 40],
        ["fair", 40, 39],
        ["fair", 69, 70],
        ["good", 70, 69],
    ])("%s matches band edge %i, not %i", (presetId, inside, outside) => {
        expect(matchesPreset("healthScore", presetId, fullRow({ healthScore: inside }))).toBe(true);
        expect(matchesPreset("healthScore", presetId, fullRow({ healthScore: outside }))).toBe(
            false,
        );
    });
    it("matches unknown for null score only", () => {
        expect(matchesPreset("healthScore", "unknown", sparseRow())).toBe(true);
        expect(matchesPreset("healthScore", "poor", sparseRow())).toBe(false);
        expect(matchesPreset("healthScore", "unknown", fullRow({ healthScore: 0 }))).toBe(false);
    });
});

describe("status presets", () => {
    it("matches deprecated for set notice only", () => {
        expect(matchesPreset("status", "deprecated", fullRow({ deprecated: "use other" }))).toBe(
            true,
        );
        expect(matchesPreset("status", "deprecated", fullRow({ deprecated: null }))).toBe(false);
    });
    it("matches outdated for true only", () => {
        expect(matchesPreset("status", "outdated", fullRow({ isOutdated: true }))).toBe(true);
        expect(matchesPreset("status", "outdated", fullRow({ isOutdated: false }))).toBe(false);
        expect(matchesPreset("status", "outdated", sparseRow())).toBe(false);
    });
    it("matches majorBehind at 1 major", () => {
        const behind = fullRow({ version: "^1.9.9", latestVersion: "2.0.0" });
        const same = fullRow({ version: "^2.0.0", latestVersion: "2.9.0" });
        expect(matchesPreset("status", "majorBehind", behind)).toBe(true);
        expect(matchesPreset("status", "majorBehind", same)).toBe(false);
        expect(matchesPreset("status", "majorBehind", sparseRow())).toBe(false);
    });
});

describe("maintainers presets", () => {
    it("matches single for one maintainer", () => {
        expect(matchesPreset("maintainers", "single", fullRow({ maintainers: ["a"] }))).toBe(true);
        expect(matchesPreset("maintainers", "single", fullRow({ maintainers: ["a", "b"] }))).toBe(
            false,
        );
        expect(matchesPreset("maintainers", "single", sparseRow())).toBe(false);
    });
    it("matches none for null or empty list", () => {
        expect(matchesPreset("maintainers", "none", sparseRow())).toBe(true);
        expect(matchesPreset("maintainers", "none", fullRow({ maintainers: [] }))).toBe(true);
        expect(matchesPreset("maintainers", "none", fullRow({ maintainers: ["a"] }))).toBe(false);
    });
});

describe("adoption presets", () => {
    it.each([
        ["under1k", 999, 1000],
        ["under10k", 9999, 10000],
    ])("%s matches inside threshold only", (presetId, inside, outside) => {
        expect(matchesPreset("adoption", presetId, fullRow({ weeklyDownloads: inside }))).toBe(
            true,
        );
        expect(matchesPreset("adoption", presetId, fullRow({ weeklyDownloads: outside }))).toBe(
            false,
        );
    });
    it("matches unknown for null downloads only", () => {
        expect(matchesPreset("adoption", "unknown", sparseRow())).toBe(true);
        expect(matchesPreset("adoption", "under1k", sparseRow())).toBe(false);
        expect(matchesPreset("adoption", "unknown", fullRow({ weeklyDownloads: 0 }))).toBe(false);
    });
});

describe("license presets", () => {
    it("matches missing for null or empty license", () => {
        expect(matchesPreset("license", "missing", sparseRow())).toBe(true);
        expect(matchesPreset("license", "missing", fullRow({ license: "" }))).toBe(true);
        expect(matchesPreset("license", "missing", fullRow({ license: "MIT" }))).toBe(false);
    });
    it("matches copyleft for GPL", () => {
        expect(matchesPreset("license", "copyleft", fullRow({ license: "GPL-3.0" }))).toBe(true);
        expect(matchesPreset("license", "copyleft", fullRow({ license: "MIT" }))).toBe(false);
    });
    it("matches custom for non-SPDX license", () => {
        expect(matchesPreset("license", "custom", fullRow({ license: "SEE LICENSE IN X" }))).toBe(
            true,
        );
        expect(matchesPreset("license", "custom", fullRow({ license: "MIT" }))).toBe(false);
        expect(matchesPreset("license", "custom", sparseRow())).toBe(false);
    });
});

describe("source presets", () => {
    it("matches noRepository for null source only", () => {
        expect(matchesPreset("source", "noRepository", sparseRow())).toBe(true);
        expect(matchesPreset("source", "noRepository", fullRow())).toBe(false);
    });
});

describe("rowMatchesHealthFilters", () => {
    const errorRow: PackageError = { name: "bad", version: "1.0.0", error: "boom" };

    it("matches every row without active filter", () => {
        expect(rowMatchesHealthFilters(errorRow, {}, NOW, "deps")).toBe(true);
        expect(rowMatchesHealthFilters(sparseRow(), {}, NOW, "deps")).toBe(true);
    });
    it("rejects error row with active filter", () => {
        expect(rowMatchesHealthFilters(errorRow, { license: "missing" }, NOW, "deps")).toBe(false);
        expect(rowMatchesHealthFilters(errorRow, { license: "missing" }, NOW, "devDeps")).toBe(
            false,
        );
    });
    it("skips bundleSize for devDeps", () => {
        const filters: HealthFilters = { bundleSize: "over250Kb" };
        expect(rowMatchesHealthFilters(fullRow(), filters, NOW, "deps")).toBe(false);
        expect(rowMatchesHealthFilters(fullRow(), filters, NOW, "devDeps")).toBe(true);
        expect(rowMatchesHealthFilters(errorRow, filters, NOW, "devDeps")).toBe(true);
    });
    it("applies other sections for devDeps", () => {
        const filters: HealthFilters = { bundleSize: "over250Kb", license: "missing" };
        expect(rowMatchesHealthFilters(fullRow(), filters, NOW, "devDeps")).toBe(false);
        expect(rowMatchesHealthFilters(sparseRow(), filters, NOW, "devDeps")).toBe(true);
    });
    it("ANDs sections", () => {
        const filters: HealthFilters = { license: "missing", source: "noRepository" };
        expect(rowMatchesHealthFilters(sparseRow(), filters, NOW, "deps")).toBe(true);
        expect(rowMatchesHealthFilters(sparseRow({ license: "MIT" }), filters, NOW, "deps")).toBe(
            false,
        );
        expect(rowMatchesHealthFilters(sparseRow({ sourceCode: "x" }), filters, NOW, "deps")).toBe(
            false,
        );
    });
    it("ignores section with unknown preset id", () => {
        const filters = { license: "nope" } as unknown as HealthFilters;
        expect(rowMatchesHealthFilters(errorRow, filters, NOW, "deps")).toBe(true);
        expect(rowMatchesHealthFilters(fullRow(), filters, NOW, "deps")).toBe(true);
        const mixed = { license: "nope", source: "noRepository" } as unknown as HealthFilters;
        expect(rowMatchesHealthFilters(fullRow(), mixed, NOW, "deps")).toBe(false);
    });
});

describe("filterRowsByHealth", () => {
    const rows: DependencyRow[] = [
        fullRow(),
        sparseRow(),
        { name: "bad", version: "1", error: "x" },
    ];

    it("returns same array for no active filter", () => {
        expect(filterRowsByHealth(rows, {}, NOW, "deps")).toBe(rows);
        expect(filterRowsByHealth(rows, { license: undefined }, NOW, "deps")).toBe(rows);
    });
    it("returns same array for unknown preset id", () => {
        const filters = { license: "nope" } as unknown as HealthFilters;
        expect(filterRowsByHealth(rows, filters, NOW, "deps")).toBe(rows);
    });
    it("returns same array for bundleSize filter on devDeps", () => {
        expect(filterRowsByHealth(rows, { bundleSize: "unknown" }, NOW, "devDeps")).toBe(rows);
    });
    it("keeps matching rows only", () => {
        expect(filterRowsByHealth(rows, { license: "missing" }, NOW, "deps")).toEqual([rows[1]]);
    });
});

describe("columnsForHealthFilters", () => {
    it("returns empty for no filter", () => {
        expect(columnsForHealthFilters({})).toEqual([]);
    });
    it("returns union of active section columns", () => {
        const filters: HealthFilters = {
            openPrRatio: "over25",
            status: "outdated",
            license: "missing",
        };
        expect(columnsForHealthFilters(filters)).toEqual([
            "openPRs",
            "closedPRs",
            "deprecated",
            "isOutdated",
            "latestVersion",
            "license",
        ]);
    });
    it("skips unknown preset id", () => {
        expect(columnsForHealthFilters({ license: "nope" } as unknown as HealthFilters)).toEqual(
            [],
        );
    });
});

describe("activeHealthFilterCount", () => {
    it("counts active sections", () => {
        expect(activeHealthFilterCount({})).toBe(0);
        expect(activeHealthFilterCount({ license: "missing", source: "noRepository" })).toBe(2);
    });
    it("skips unknown preset id", () => {
        expect(activeHealthFilterCount({ license: "nope" } as unknown as HealthFilters)).toBe(0);
    });
});

describe("HEALTH_FILTER_SECTIONS", () => {
    it("uses unique camelCase ids", () => {
        const sectionIds = HEALTH_FILTER_SECTIONS.map((section) => section.id);
        expect(new Set(sectionIds).size).toBe(sectionIds.length);
        for (const section of HEALTH_FILTER_SECTIONS) {
            expect(section.id).toMatch(/^[a-z][A-Za-z0-9]*$/);
            const presetIds = section.presets.map((preset) => preset.id);
            expect(new Set(presetIds).size).toBe(presetIds.length);
        }
    });
});

describe("month-end age threshold", () => {
    const monthEnd = new Date(Date.UTC(2026, 2, 31, 12));
    const filters: HealthFilters = { lastPublished: "within1Month" };
    it("clamps to last day of shorter month", () => {
        const lastDay = fullRow({ latestReleaseDate: "2026-02-28T12:00:00.000Z" });
        const dayBefore = fullRow({ latestReleaseDate: "2026-02-28T11:59:59.999Z" });
        expect(rowMatchesHealthFilters(lastDay, filters, monthEnd, "deps")).toBe(true);
        expect(rowMatchesHealthFilters(dayBefore, filters, monthEnd, "deps")).toBe(false);
    });
});
