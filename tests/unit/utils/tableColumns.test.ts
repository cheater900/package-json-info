import { describe, it, expect } from "vitest";
import {
    DEPENDENCY_TABLE_COLUMNS,
    TOGGLEABLE_COLUMNS,
    MIN_VISIBLE_COLUMNS,
    DEFAULT_VISIBLE_COLUMNS,
    DEFAULT_COLUMN_ORDER,
    isColumnVisible,
    meetsMinVisible,
    wouldViolateMinVisible,
    toggleColumnVisibility,
    orderColumns,
    mergeColumnOrder,
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

describe("DEFAULT_COLUMN_ORDER", () => {
    it("is every toggleable column key, in declaration order", () => {
        expect(DEFAULT_COLUMN_ORDER).toEqual(TOGGLEABLE_COLUMNS.map((c) => c.key));
    });
});

describe("orderColumns", () => {
    it("maps a valid full order to the matching ColumnDefs, in that order", () => {
        const order = [TOGGLEABLE_COLUMNS[1].key, TOGGLEABLE_COLUMNS[0].key];
        const result = orderColumns(order, TOGGLEABLE_COLUMNS.slice(0, 2));
        expect(result).toEqual([TOGGLEABLE_COLUMNS[1], TOGGLEABLE_COLUMNS[0]]);
    });

    it("falls back to columns' own declaration order when order is empty", () => {
        const columns = TOGGLEABLE_COLUMNS.slice(0, 3);
        expect(orderColumns([], columns)).toEqual(columns);
    });

    it("appends columns missing from order, in declaration order, at the end", () => {
        const columns = TOGGLEABLE_COLUMNS.slice(0, 3);
        const order = [columns[2].key];
        expect(orderColumns(order, columns)).toEqual([columns[2], columns[0], columns[1]]);
    });

    it("drops keys that no longer correspond to a real column", () => {
        const columns = TOGGLEABLE_COLUMNS.slice(0, 2);
        const order = ["some-removed-column", columns[1].key, columns[0].key];
        expect(orderColumns(order, columns)).toEqual([columns[1], columns[0]]);
    });

    it("dedupes a repeated key, keeping only its first occurrence", () => {
        const columns = TOGGLEABLE_COLUMNS.slice(0, 2);
        const order = [columns[0].key, columns[1].key, columns[0].key];
        expect(orderColumns(order, columns)).toEqual([columns[0], columns[1]]);
    });
});

describe("mergeColumnOrder", () => {
    it("keeps a single hidden column in its exact slot while permuting the visible ones", () => {
        const fullOrder = ["a", "b", "c"];
        // "b" is hidden (not part of the drag); "a" and "c" swap.
        const result = mergeColumnOrder(fullOrder, ["c", "a"]);
        expect(result).toEqual(["c", "b", "a"]);
    });

    it("keeps multiple interleaved hidden columns each in their own slot", () => {
        const fullOrder = ["a", "hidden1", "b", "hidden2", "c"];
        const result = mergeColumnOrder(fullOrder, ["c", "b", "a"]);
        expect(result).toEqual(["c", "hidden1", "b", "hidden2", "a"]);
    });

    it("is a plain permutation when every column is visible", () => {
        const fullOrder = ["a", "b", "c"];
        expect(mergeColumnOrder(fullOrder, ["c", "b", "a"])).toEqual(["c", "b", "a"]);
    });

    it("is a no-op when only one column is visible", () => {
        const fullOrder = ["a", "hidden", "b"];
        expect(mergeColumnOrder(fullOrder, ["a"])).toEqual(["a", "hidden", "b"]);
    });
});
