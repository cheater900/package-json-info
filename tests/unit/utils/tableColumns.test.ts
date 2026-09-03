import { describe, it, expect } from "vitest";
import {
    DEPENDENCY_TABLE_COLUMNS,
    TOGGLEABLE_COLUMNS,
    MIN_VISIBLE_COLUMNS,
    DEFAULT_VISIBLE_COLUMNS,
    isColumnVisible,
    meetsMinVisible,
    wouldViolateMinVisible,
    toggleColumnVisibility,
} from "../../../src/utils/tableColumns";

describe("TOGGLEABLE_COLUMNS", () => {
    it("excludes the always-visible Name and Load columns", () => {
        expect(TOGGLEABLE_COLUMNS.some((c) => c.key === "name")).toBe(false);
        expect(TOGGLEABLE_COLUMNS.some((c) => c.key === "loadAction")).toBe(false);
        expect(TOGGLEABLE_COLUMNS.length).toBe(DEPENDENCY_TABLE_COLUMNS.length - 2);
    });
});

describe("DEFAULT_VISIBLE_COLUMNS", () => {
    it("excludes the third-party-service columns and Maintainers", () => {
        expect(DEFAULT_VISIBLE_COLUMNS.has("vulnerabilityCount")).toBe(false);
        expect(DEFAULT_VISIBLE_COLUMNS.has("bundleSizeGzip")).toBe(false);
        expect(DEFAULT_VISIBLE_COLUMNS.has("maintainers")).toBe(false);
    });

    it("includes every other toggleable column", () => {
        const expectedVisibleByDefault = [
            "versionDate",
            "latestVersion",
            "latestReleaseDate",
            "latestUpdateDate",
            "isOutdated",
            "weeklyDownloads",
            "sourceCode",
            "gitStars",
            "openPRs",
            "closedPRs",
            "openIssues",
            "closedIssues",
            "dependencies",
            "license",
            "deprecated",
        ];
        for (const key of expectedVisibleByDefault) {
            expect(isColumnVisible(DEFAULT_VISIBLE_COLUMNS, key)).toBe(true);
        }
    });

    it("only contains keys of columns that actually exist", () => {
        const columnKeys = new Set(DEPENDENCY_TABLE_COLUMNS.map((c) => c.key));
        for (const key of DEFAULT_VISIBLE_COLUMNS) {
            expect(columnKeys.has(key)).toBe(true);
        }
    });
});

describe("isColumnVisible", () => {
    it("is always true for the Name and Load columns, regardless of the visible set", () => {
        expect(isColumnVisible(new Set(["name"]), "name")).toBe(true);
        expect(isColumnVisible(new Set(), "name")).toBe(true);
        expect(isColumnVisible(new Set(["loadAction"]), "loadAction")).toBe(true);
        expect(isColumnVisible(new Set(), "loadAction")).toBe(true);
    });

    it("reflects membership in the visible set for other columns", () => {
        expect(isColumnVisible(new Set(["license"]), "license")).toBe(true);
        expect(isColumnVisible(new Set(["license"]), "version")).toBe(false);
    });
});

describe("MIN_VISIBLE_COLUMNS", () => {
    it("is one more than the number of always-visible columns, so at least one real data column always shows", () => {
        // Name + Load are always visible; the floor must still force at least
        // one further (toggleable) column to stay visible alongside them.
        expect(MIN_VISIBLE_COLUMNS).toBe(3);
    });
});

describe("meetsMinVisible", () => {
    it("is false when only the always-visible columns would show", () => {
        expect(meetsMinVisible(new Set())).toBe(false);
    });

    it("is true once enough toggleable columns are visible to reach the floor", () => {
        expect(meetsMinVisible(new Set([TOGGLEABLE_COLUMNS[0].key]))).toBe(true);
    });
});

describe("wouldViolateMinVisible", () => {
    it("is false for a column that's already hidden (not in the visible set)", () => {
        const visible = new Set([TOGGLEABLE_COLUMNS[0].key]);
        expect(wouldViolateMinVisible(visible, TOGGLEABLE_COLUMNS[1].key)).toBe(false);
    });

    it("is true when hiding the last remaining visible non-name column", () => {
        const visible = new Set([TOGGLEABLE_COLUMNS[0].key]);
        expect(wouldViolateMinVisible(visible, TOGGLEABLE_COLUMNS[0].key)).toBe(true);
    });

    it("is false when more than one non-name column is currently visible", () => {
        const visible = new Set([TOGGLEABLE_COLUMNS[0].key, TOGGLEABLE_COLUMNS[1].key]);
        expect(wouldViolateMinVisible(visible, TOGGLEABLE_COLUMNS[0].key)).toBe(false);
    });
});

describe("toggleColumnVisibility", () => {
    it("never removes or adds the Name or Load columns", () => {
        const result = toggleColumnVisibility(new Set(), "name");
        expect(result.has("name")).toBe(false);
        expect(toggleColumnVisibility(new Set(), "loadAction").has("loadAction")).toBe(false);
    });

    it("shows a currently-hidden column", () => {
        const result = toggleColumnVisibility(new Set(), "license");
        expect(result.has("license")).toBe(true);
    });

    it("hides a currently-visible column", () => {
        // Two columns visible so hiding one doesn't hit the MIN_VISIBLE_COLUMNS floor.
        const result = toggleColumnVisibility(new Set(["license", "deprecated"]), "license");
        expect(result.has("license")).toBe(false);
        expect(result.has("deprecated")).toBe(true);
    });

    it("refuses to hide the last remaining visible non-name column", () => {
        const visible = new Set([TOGGLEABLE_COLUMNS[0].key]);
        const lastVisibleKey = TOGGLEABLE_COLUMNS[0].key;

        const result = toggleColumnVisibility(visible, lastVisibleKey);

        expect(result.has(lastVisibleKey)).toBe(true);
        const totalVisible =
            DEPENDENCY_TABLE_COLUMNS.length - TOGGLEABLE_COLUMNS.length + result.size;
        expect(totalVisible).toBe(MIN_VISIBLE_COLUMNS);
    });

    it("does not mutate the input set", () => {
        const original = new Set(["license"]);
        toggleColumnVisibility(original, "deprecated");
        expect(original).toEqual(new Set(["license"]));
    });
});
