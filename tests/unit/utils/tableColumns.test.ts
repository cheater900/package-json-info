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
    abbreviateLabel,
} from "../../../src/utils/tableColumns";

describe("TOGGLEABLE_COLUMNS", () => {
    it("excludes always-visible Name column", () => {
        expect(TOGGLEABLE_COLUMNS.some((c) => c.key === "name")).toBe(false);
        expect(TOGGLEABLE_COLUMNS.length).toBe(DEPENDENCY_TABLE_COLUMNS.length - 1);
    });
});

describe("DEFAULT_VISIBLE_COLUMNS", () => {
    it("excludes third-party-service columns and Maintainers", () => {
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
            "healthScore",
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

    it("contains only existing column keys", () => {
        const columnKeys = new Set(DEPENDENCY_TABLE_COLUMNS.map((c) => c.key));
        for (const key of DEFAULT_VISIBLE_COLUMNS) {
            expect(columnKeys.has(key)).toBe(true);
        }
    });
});

describe("healthScore column", () => {
    it("sits right after isOutdated, sortable", () => {
        const keys = DEPENDENCY_TABLE_COLUMNS.map((c) => c.key);
        const column = DEPENDENCY_TABLE_COLUMNS[keys.indexOf("isOutdated") + 1];

        expect(column.key).toBe("healthScore");
        expect(column.sortable).toBe(true);
        expect(column.label).toBe("Health");
    });
});

describe("isColumnVisible", () => {
    it("returns true for Name column with any visible set", () => {
        expect(isColumnVisible(new Set(["name"]), "name")).toBe(true);
        expect(isColumnVisible(new Set(), "name")).toBe(true);
    });

    it("reflects visible set membership for other columns", () => {
        expect(isColumnVisible(new Set(["license"]), "license")).toBe(true);
        expect(isColumnVisible(new Set(["license"]), "version")).toBe(false);
    });
});

describe("meetsMinVisible", () => {
    it("returns false with only always-visible columns", () => {
        expect(meetsMinVisible(new Set())).toBe(false);
    });

    it("returns true once visible toggleable columns reach floor", () => {
        expect(meetsMinVisible(new Set([TOGGLEABLE_COLUMNS[0].key]))).toBe(true);
    });
});

describe("wouldViolateMinVisible", () => {
    it("returns false for always-visible Name column", () => {
        expect(wouldViolateMinVisible(new Set(["license"]), "name")).toBe(false);
    });

    it("returns false for hidden column", () => {
        const visible = new Set([TOGGLEABLE_COLUMNS[0].key]);
        expect(wouldViolateMinVisible(visible, TOGGLEABLE_COLUMNS[1].key)).toBe(false);
    });

    it("returns true for hiding last visible non-name column", () => {
        const visible = new Set([TOGGLEABLE_COLUMNS[0].key]);
        expect(wouldViolateMinVisible(visible, TOGGLEABLE_COLUMNS[0].key)).toBe(true);
    });

    it("returns false with several visible non-name columns", () => {
        const visible = new Set([TOGGLEABLE_COLUMNS[0].key, TOGGLEABLE_COLUMNS[1].key]);
        expect(wouldViolateMinVisible(visible, TOGGLEABLE_COLUMNS[0].key)).toBe(false);
    });
});

describe("toggleColumnVisibility", () => {
    it("never removes or adds Name column", () => {
        const result = toggleColumnVisibility(new Set(), "name");
        expect(result.has("name")).toBe(false);
    });

    it("shows hidden column", () => {
        const result = toggleColumnVisibility(new Set(), "license");
        expect(result.has("license")).toBe(true);
    });

    it("hides visible column", () => {
        // Two columns visible so hiding one doesn't hit the MIN_VISIBLE_COLUMNS floor.
        const result = toggleColumnVisibility(new Set(["license", "deprecated"]), "license");
        expect(result.has("license")).toBe(false);
        expect(result.has("deprecated")).toBe(true);
    });

    it("refuses to hide last visible non-name column", () => {
        const visible = new Set([TOGGLEABLE_COLUMNS[0].key]);
        const lastVisibleKey = TOGGLEABLE_COLUMNS[0].key;

        const result = toggleColumnVisibility(visible, lastVisibleKey);

        expect(result.has(lastVisibleKey)).toBe(true);
        const totalVisible =
            DEPENDENCY_TABLE_COLUMNS.length - TOGGLEABLE_COLUMNS.length + result.size;
        expect(totalVisible).toBe(MIN_VISIBLE_COLUMNS);
    });

    it("keeps input set unmutated", () => {
        const original = new Set(["license"]);
        toggleColumnVisibility(original, "deprecated");
        expect(original).toEqual(new Set(["license"]));
    });
});

describe("DEFAULT_COLUMN_ORDER", () => {
    it("lists every toggleable column key in declaration order", () => {
        expect(DEFAULT_COLUMN_ORDER).toEqual(TOGGLEABLE_COLUMNS.map((c) => c.key));
    });
});

describe("orderColumns", () => {
    it("maps valid full order to matching ColumnDefs in order", () => {
        const order = [TOGGLEABLE_COLUMNS[1].key, TOGGLEABLE_COLUMNS[0].key];
        const result = orderColumns(order, TOGGLEABLE_COLUMNS.slice(0, 2));
        expect(result).toEqual([TOGGLEABLE_COLUMNS[1], TOGGLEABLE_COLUMNS[0]]);
    });

    it("falls back to declaration order for empty order", () => {
        const columns = TOGGLEABLE_COLUMNS.slice(0, 3);
        expect(orderColumns([], columns)).toEqual(columns);
    });

    it("appends columns missing from order at end, in declaration order", () => {
        const columns = TOGGLEABLE_COLUMNS.slice(0, 3);
        const order = [columns[2].key];
        expect(orderColumns(order, columns)).toEqual([columns[2], columns[0], columns[1]]);
    });

    it("drops keys of removed columns", () => {
        const columns = TOGGLEABLE_COLUMNS.slice(0, 2);
        const order = ["some-removed-column", columns[1].key, columns[0].key];
        expect(orderColumns(order, columns)).toEqual([columns[1], columns[0]]);
    });

    it("dedupes repeated key, keeps first occurrence", () => {
        const columns = TOGGLEABLE_COLUMNS.slice(0, 2);
        const order = [columns[0].key, columns[1].key, columns[0].key];
        expect(orderColumns(order, columns)).toEqual([columns[0], columns[1]]);
    });
});

describe("mergeColumnOrder", () => {
    it("keeps hidden column in own slot, permutes visible ones", () => {
        const fullOrder = ["a", "b", "c"];
        // "b" is hidden (not part of the drag); "a" and "c" swap.
        const result = mergeColumnOrder(fullOrder, ["c", "a"]);
        expect(result).toEqual(["c", "b", "a"]);
    });

    it("keeps interleaved hidden columns in own slots", () => {
        const fullOrder = ["a", "hidden1", "b", "hidden2", "c"];
        const result = mergeColumnOrder(fullOrder, ["c", "b", "a"]);
        expect(result).toEqual(["c", "hidden1", "b", "hidden2", "a"]);
    });

    it("equals plain permutation with every column visible", () => {
        const fullOrder = ["a", "b", "c"];
        expect(mergeColumnOrder(fullOrder, ["c", "b", "a"])).toEqual(["c", "b", "a"]);
    });

    it("does nothing with one visible column", () => {
        const fullOrder = ["a", "hidden", "b"];
        expect(mergeColumnOrder(fullOrder, ["a"])).toEqual(["a", "hidden", "b"]);
    });
});

describe("abbreviateLabel", () => {
    it("abbreviates two-word label to initials", () => {
        expect(abbreviateLabel("Version Date")).toBe("VD");
    });

    it("abbreviates three-word label to initials", () => {
        expect(abbreviateLabel("Latest release date")).toBe("LRD");
    });

    it("leaves single-word label unchanged", () => {
        expect(abbreviateLabel("Outdated")).toBe("Outdated");
    });

    it("ignores non-letter characters for word initials", () => {
        expect(abbreviateLabel("Bundle size (gzip)")).toBe("BSG");
    });

    it("collapses repeated whitespace between words", () => {
        expect(abbreviateLabel("Latest   release date")).toBe("LRD");
    });
});
