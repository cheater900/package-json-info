import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    loadVisibleColumns,
    saveVisibleColumns,
} from "../../../src/utils/columnPreferencesStorage";
import { DEFAULT_VISIBLE_COLUMNS, TOGGLEABLE_COLUMNS } from "../../../src/utils/tableColumns";

const STORAGE_KEY = "package-json-info:visibleColumns";

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
