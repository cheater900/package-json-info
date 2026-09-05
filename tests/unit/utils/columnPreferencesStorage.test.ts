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

const STORAGE_KEY = "package-json-info:visibleColumns";
const ORDER_STORAGE_KEY = "package-json-info:columnOrder";
const SHRINK_LABELS_STORAGE_KEY = "package-json-info:shrinkColumnLabels";

beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

describe("loadVisibleColumns", () => {
    it("returns DEFAULT_VISIBLE_COLUMNS when nothing has been stored yet", () => {
        expect(loadVisibleColumns()).toEqual(new Set(DEFAULT_VISIBLE_COLUMNS));
    });

    it("returns a previously saved set", () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(["license", "sourceCode"]));

        expect(loadVisibleColumns()).toEqual(new Set(["license", "sourceCode"]));
    });

    it("falls back to defaults when the stored value isn't a JSON array", () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: "an array" }));

        expect(loadVisibleColumns()).toEqual(new Set(DEFAULT_VISIBLE_COLUMNS));
    });

    it("falls back to defaults when the stored value isn't valid JSON", () => {
        localStorage.setItem(STORAGE_KEY, "{not valid json");

        expect(loadVisibleColumns()).toEqual(new Set(DEFAULT_VISIBLE_COLUMNS));
    });

    it("drops keys that no longer correspond to a real toggleable column", () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(["license", "sourceCode", "some-removed-column", "name", 42, null]),
        );

        expect(loadVisibleColumns()).toEqual(new Set(["license", "sourceCode"]));
    });

    it("falls back to defaults when the stored set is empty (would leave only Name/Load visible)", () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([]));

        expect(loadVisibleColumns()).toEqual(new Set(DEFAULT_VISIBLE_COLUMNS));
    });

    it("keeps a stored set with exactly one visible column (Name + Load + it meets the floor)", () => {
        const oneKey = [TOGGLEABLE_COLUMNS[0].key];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(oneKey));

        expect(loadVisibleColumns()).toEqual(new Set(oneKey));
    });

    it("falls back to defaults instead of throwing when localStorage.getItem throws", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("storage disabled");
        });

        expect(loadVisibleColumns()).toEqual(new Set(DEFAULT_VISIBLE_COLUMNS));
    });
});

describe("saveVisibleColumns", () => {
    it("persists the set as a JSON array", () => {
        saveVisibleColumns(new Set(["license", "sourceCode"]));

        expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(["license", "sourceCode"]);
    });

    it("round-trips through loadVisibleColumns", () => {
        const twoKeys = [TOGGLEABLE_COLUMNS[0].key, TOGGLEABLE_COLUMNS[1].key];
        saveVisibleColumns(new Set(twoKeys));

        expect(loadVisibleColumns()).toEqual(new Set(twoKeys));
    });

    it("does not throw when localStorage.setItem throws", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("quota exceeded");
        });

        expect(() => saveVisibleColumns(new Set(["license"]))).not.toThrow();
    });
});

describe("loadColumnOrder", () => {
    it("returns DEFAULT_COLUMN_ORDER when nothing has been stored yet", () => {
        expect(loadColumnOrder()).toEqual([...DEFAULT_COLUMN_ORDER]);
    });

    it("returns a previously saved full permutation unchanged", () => {
        const order = TOGGLEABLE_COLUMNS.map((c) => c.key).reverse();
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));

        expect(loadColumnOrder()).toEqual(order);
    });

    it("falls back to the default order when the stored value isn't a JSON array", () => {
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify({ not: "an array" }));

        expect(loadColumnOrder()).toEqual([...DEFAULT_COLUMN_ORDER]);
    });

    it("falls back to the default order when the stored value isn't valid JSON", () => {
        localStorage.setItem(ORDER_STORAGE_KEY, "{not valid json");

        expect(loadColumnOrder()).toEqual([...DEFAULT_COLUMN_ORDER]);
    });

    it("drops keys that no longer correspond to a real toggleable column", () => {
        const validOrder = TOGGLEABLE_COLUMNS.map((c) => c.key).reverse();
        const order = [validOrder[0], "some-removed-column", ...validOrder.slice(1)];
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));

        expect(loadColumnOrder()).toEqual(validOrder);
    });

    it("appends a valid column missing from the stored order, instead of losing it", () => {
        const order = TOGGLEABLE_COLUMNS.slice(1).map((c) => c.key);
        localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(order));

        expect(loadColumnOrder()).toEqual([...order, TOGGLEABLE_COLUMNS[0].key]);
    });

    it("falls back to the default order instead of throwing when localStorage.getItem throws", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("storage disabled");
        });

        expect(loadColumnOrder()).toEqual([...DEFAULT_COLUMN_ORDER]);
    });
});

describe("saveColumnOrder", () => {
    it("persists the order as a JSON array", () => {
        const order = [TOGGLEABLE_COLUMNS[1].key, TOGGLEABLE_COLUMNS[0].key];
        saveColumnOrder(order);

        expect(JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY)!)).toEqual(order);
    });

    it("round-trips a full permutation through loadColumnOrder", () => {
        const order = TOGGLEABLE_COLUMNS.map((c) => c.key).reverse();
        saveColumnOrder(order);

        expect(loadColumnOrder()).toEqual(order);
    });

    it("does not throw when localStorage.setItem throws", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("quota exceeded");
        });

        expect(() => saveColumnOrder([TOGGLEABLE_COLUMNS[0].key])).not.toThrow();
    });
});

describe("loadShrinkColumnLabels", () => {
    it("returns false when nothing has been stored yet", () => {
        expect(loadShrinkColumnLabels()).toBe(false);
    });

    it("returns true when true was previously saved", () => {
        localStorage.setItem(SHRINK_LABELS_STORAGE_KEY, JSON.stringify(true));

        expect(loadShrinkColumnLabels()).toBe(true);
    });

    it("returns false when false was previously saved", () => {
        localStorage.setItem(SHRINK_LABELS_STORAGE_KEY, JSON.stringify(false));

        expect(loadShrinkColumnLabels()).toBe(false);
    });

    it("returns false when the stored value isn't valid JSON", () => {
        localStorage.setItem(SHRINK_LABELS_STORAGE_KEY, "{not valid json");

        expect(loadShrinkColumnLabels()).toBe(false);
    });

    it("returns false when the stored value isn't a boolean", () => {
        localStorage.setItem(SHRINK_LABELS_STORAGE_KEY, JSON.stringify("true"));

        expect(loadShrinkColumnLabels()).toBe(false);
    });

    it("returns false instead of throwing when localStorage.getItem throws", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("storage disabled");
        });

        expect(loadShrinkColumnLabels()).toBe(false);
    });
});

describe("saveShrinkColumnLabels", () => {
    it("persists true as a JSON boolean", () => {
        saveShrinkColumnLabels(true);

        expect(JSON.parse(localStorage.getItem(SHRINK_LABELS_STORAGE_KEY)!)).toBe(true);
    });

    it("round-trips through loadShrinkColumnLabels", () => {
        saveShrinkColumnLabels(true);

        expect(loadShrinkColumnLabels()).toBe(true);
    });

    it("does not throw when localStorage.setItem throws", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("quota exceeded");
        });

        expect(() => saveShrinkColumnLabels(true)).not.toThrow();
    });
});
