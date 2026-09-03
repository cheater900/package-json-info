import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadHiddenColumns, saveHiddenColumns } from "../../../src/utils/columnPreferencesStorage";
import { DEFAULT_HIDDEN_COLUMNS, TOGGLEABLE_COLUMNS } from "../../../src/utils/tableColumns";

const STORAGE_KEY = "package-json-info:hiddenColumns";

beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
});

describe("loadHiddenColumns", () => {
    it("returns DEFAULT_HIDDEN_COLUMNS when nothing has been stored yet", () => {
        expect(loadHiddenColumns()).toEqual(new Set(DEFAULT_HIDDEN_COLUMNS));
    });

    it("returns a previously saved set", () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(["license", "sourceCode"]));

        expect(loadHiddenColumns()).toEqual(new Set(["license", "sourceCode"]));
    });

    it("returns an empty set when the user had explicitly unhidden everything", () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([]));

        expect(loadHiddenColumns()).toEqual(new Set());
    });

    it("falls back to defaults when the stored value isn't a JSON array", () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: "an array" }));

        expect(loadHiddenColumns()).toEqual(new Set(DEFAULT_HIDDEN_COLUMNS));
    });

    it("falls back to defaults when the stored value isn't valid JSON", () => {
        localStorage.setItem(STORAGE_KEY, "{not valid json");

        expect(loadHiddenColumns()).toEqual(new Set(DEFAULT_HIDDEN_COLUMNS));
    });

    it("drops keys that no longer correspond to a real toggleable column", () => {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(["license", "some-removed-column", "name", 42, null]),
        );

        expect(loadHiddenColumns()).toEqual(new Set(["license"]));
    });

    it("falls back to defaults if the stored set would hide every toggleable column", () => {
        const everyToggleableKey = TOGGLEABLE_COLUMNS.map((c) => c.key);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(everyToggleableKey));

        expect(loadHiddenColumns()).toEqual(new Set(DEFAULT_HIDDEN_COLUMNS));
    });

    it("falls back to defaults instead of throwing when localStorage.getItem throws", () => {
        vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
            throw new Error("storage disabled");
        });

        expect(loadHiddenColumns()).toEqual(new Set(DEFAULT_HIDDEN_COLUMNS));
    });
});

describe("saveHiddenColumns", () => {
    it("persists the set as a JSON array", () => {
        saveHiddenColumns(new Set(["license", "sourceCode"]));

        expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(["license", "sourceCode"]);
    });

    it("round-trips through loadHiddenColumns", () => {
        saveHiddenColumns(new Set(["maintainers"]));

        expect(loadHiddenColumns()).toEqual(new Set(["maintainers"]));
    });

    it("persists an empty set (everything visible) rather than being treated as unset", () => {
        saveHiddenColumns(new Set());

        expect(loadHiddenColumns()).toEqual(new Set());
    });

    it("does not throw when localStorage.setItem throws", () => {
        vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
            throw new Error("quota exceeded");
        });

        expect(() => saveHiddenColumns(new Set(["license"]))).not.toThrow();
    });
});
