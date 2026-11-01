import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    loadVisibleColumns,
    saveVisibleColumns,
    loadColumnOrder,
    saveColumnOrder,
    loadShrinkColumnLabels,
    saveShrinkColumnLabels,
} from "../../../src/utils/columnPreferencesStorage";
import {
    DEFAULT_VISIBLE_COLUMNS,
    DEFAULT_COLUMN_ORDER,
    TOGGLEABLE_COLUMNS,
} from "../../../src/utils/tableColumns";
import {
    STORAGE_KEY_VISIBLE_COLUMNS,
    STORAGE_KEY_COLUMN_ORDER,
    STORAGE_KEY_SHRINK_LABELS,
} from "../../../src/constants";

beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

describe("loadVisibleColumns", () => {
    it("returns DEFAULT_VISIBLE_COLUMNS for empty storage", () => {
        expect(loadVisibleColumns()).toEqual(new Set(DEFAULT_VISIBLE_COLUMNS));
    });

    it("returns saved set", () => {
        localStorage.setItem(
            STORAGE_KEY_VISIBLE_COLUMNS,
            JSON.stringify(["license", "sourceCode"]),
        );

        expect(loadVisibleColumns()).toEqual(new Set(["license", "sourceCode"]));
    });

    it("falls back to defaults for non-array stored value", () => {
        localStorage.setItem(STORAGE_KEY_VISIBLE_COLUMNS, JSON.stringify({ not: "an array" }));

        expect(loadVisibleColumns()).toEqual(new Set(DEFAULT_VISIBLE_COLUMNS));
    });

    it("falls back to defaults for invalid stored JSON", () => {
        localStorage.setItem(STORAGE_KEY_VISIBLE_COLUMNS, "{not valid json");

        expect(loadVisibleColumns()).toEqual(new Set(DEFAULT_VISIBLE_COLUMNS));
    });

    it("drops keys of removed toggleable columns", () => {
        localStorage.setItem(
            STORAGE_KEY_VISIBLE_COLUMNS,
            JSON.stringify(["license", "sourceCode", "some-removed-column", "name", 42, null]),
        );

        expect(loadVisibleColumns()).toEqual(new Set(["license", "sourceCode"]));
    });

    it("falls back to defaults for empty stored set", () => {
        localStorage.setItem(STORAGE_KEY_VISIBLE_COLUMNS, JSON.stringify([]));

        expect(loadVisibleColumns()).toEqual(new Set(DEFAULT_VISIBLE_COLUMNS));
    });

    it("keeps stored set with one visible column", () => {
        const oneKey = [TOGGLEABLE_COLUMNS[0].key];
        localStorage.setItem(STORAGE_KEY_VISIBLE_COLUMNS, JSON.stringify(oneKey));

        expect(loadVisibleColumns()).toEqual(new Set(oneKey));
    });

    it("falls back to defaults on localStorage.getItem throw", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("storage disabled");
        });

        expect(loadVisibleColumns()).toEqual(new Set(DEFAULT_VISIBLE_COLUMNS));
    });
});

describe("saveVisibleColumns", () => {
    it("persists set as JSON array", () => {
        saveVisibleColumns(new Set(["license", "sourceCode"]));

        expect(JSON.parse(localStorage.getItem(STORAGE_KEY_VISIBLE_COLUMNS)!)).toEqual([
            "license",
            "sourceCode",
        ]);
    });

    it("round-trips through loadVisibleColumns", () => {
        const twoKeys = [TOGGLEABLE_COLUMNS[0].key, TOGGLEABLE_COLUMNS[1].key];
        saveVisibleColumns(new Set(twoKeys));

        expect(loadVisibleColumns()).toEqual(new Set(twoKeys));
    });

    it("survives localStorage.setItem throw", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("quota exceeded");
        });

        expect(() => saveVisibleColumns(new Set(["license"]))).not.toThrow();
    });
});

describe("loadColumnOrder", () => {
    it("returns DEFAULT_COLUMN_ORDER for empty storage", () => {
        expect(loadColumnOrder()).toEqual([...DEFAULT_COLUMN_ORDER]);
    });

    it("returns saved full permutation unchanged", () => {
        const order = TOGGLEABLE_COLUMNS.map((c) => c.key).reverse();
        localStorage.setItem(STORAGE_KEY_COLUMN_ORDER, JSON.stringify(order));

        expect(loadColumnOrder()).toEqual(order);
    });

    it("falls back to default order for non-array stored value", () => {
        localStorage.setItem(STORAGE_KEY_COLUMN_ORDER, JSON.stringify({ not: "an array" }));

        expect(loadColumnOrder()).toEqual([...DEFAULT_COLUMN_ORDER]);
    });

    it("falls back to default order for invalid stored JSON", () => {
        localStorage.setItem(STORAGE_KEY_COLUMN_ORDER, "{not valid json");

        expect(loadColumnOrder()).toEqual([...DEFAULT_COLUMN_ORDER]);
    });

    it("drops keys of removed toggleable columns", () => {
        const validOrder = TOGGLEABLE_COLUMNS.map((c) => c.key).reverse();
        const order = [validOrder[0], "some-removed-column", ...validOrder.slice(1)];
        localStorage.setItem(STORAGE_KEY_COLUMN_ORDER, JSON.stringify(order));

        expect(loadColumnOrder()).toEqual(validOrder);
    });

    it("appends valid column missing from stored order", () => {
        const order = TOGGLEABLE_COLUMNS.slice(1).map((c) => c.key);
        localStorage.setItem(STORAGE_KEY_COLUMN_ORDER, JSON.stringify(order));

        expect(loadColumnOrder()).toEqual([...order, TOGGLEABLE_COLUMNS[0].key]);
    });

    it("falls back to default order on localStorage.getItem throw", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("storage disabled");
        });

        expect(loadColumnOrder()).toEqual([...DEFAULT_COLUMN_ORDER]);
    });
});

describe("saveColumnOrder", () => {
    it("persists order as JSON array", () => {
        const order = [TOGGLEABLE_COLUMNS[1].key, TOGGLEABLE_COLUMNS[0].key];
        saveColumnOrder(order);

        expect(JSON.parse(localStorage.getItem(STORAGE_KEY_COLUMN_ORDER)!)).toEqual(order);
    });

    it("round-trips full permutation through loadColumnOrder", () => {
        const order = TOGGLEABLE_COLUMNS.map((c) => c.key).reverse();
        saveColumnOrder(order);

        expect(loadColumnOrder()).toEqual(order);
    });

    it("survives localStorage.setItem throw", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("quota exceeded");
        });

        expect(() => saveColumnOrder([TOGGLEABLE_COLUMNS[0].key])).not.toThrow();
    });
});

describe("loadShrinkColumnLabels", () => {
    it("returns false for empty storage", () => {
        expect(loadShrinkColumnLabels()).toBe(false);
    });

    it("returns true for saved true", () => {
        localStorage.setItem(STORAGE_KEY_SHRINK_LABELS, JSON.stringify(true));

        expect(loadShrinkColumnLabels()).toBe(true);
    });

    it("returns false for saved false", () => {
        localStorage.setItem(STORAGE_KEY_SHRINK_LABELS, JSON.stringify(false));

        expect(loadShrinkColumnLabels()).toBe(false);
    });

    it("returns false for invalid stored JSON", () => {
        localStorage.setItem(STORAGE_KEY_SHRINK_LABELS, "{not valid json");

        expect(loadShrinkColumnLabels()).toBe(false);
    });

    it("returns false for non-boolean stored value", () => {
        localStorage.setItem(STORAGE_KEY_SHRINK_LABELS, JSON.stringify("true"));

        expect(loadShrinkColumnLabels()).toBe(false);
    });

    it("returns false on localStorage.getItem throw", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("storage disabled");
        });

        expect(loadShrinkColumnLabels()).toBe(false);
    });
});

describe("saveShrinkColumnLabels", () => {
    it("persists true as JSON boolean", () => {
        saveShrinkColumnLabels(true);

        expect(JSON.parse(localStorage.getItem(STORAGE_KEY_SHRINK_LABELS)!)).toBe(true);
    });

    it("round-trips through loadShrinkColumnLabels", () => {
        saveShrinkColumnLabels(true);

        expect(loadShrinkColumnLabels()).toBe(true);
    });

    it("survives localStorage.setItem throw", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("quota exceeded");
        });

        expect(() => saveShrinkColumnLabels(true)).not.toThrow();
    });
});
