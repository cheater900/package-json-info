import { describe, it, expect } from "vitest";
import {
    createHistoryEntry,
    pushHistoryEntry,
    canGoBack,
    canGoForward,
    visibleColumnsEqual,
    isEntryCacheValid,
} from "../../../src/utils/packageJsonHistory";

describe("createHistoryEntry", () => {
    it("starts with unfetched deps/devDeps and no visibleColumns snapshot", () => {
        const entry = createHistoryEntry("{}", { name: "demo" });
        expect(entry).toEqual({
            content: "{}",
            pkg: { name: "demo" },
            deps: null,
            devDeps: null,
            visibleColumnsSnapshot: null,
        });
    });
});

describe("pushHistoryEntry", () => {
    it("appends to an empty history and points the index at it", () => {
        const entry = createHistoryEntry("{}", {});
        const { history, index } = pushHistoryEntry([], -1, entry);

        expect(history).toEqual([entry]);
        expect(index).toBe(0);
    });

    it("appends after the current index without touching earlier entries", () => {
        const first = createHistoryEntry("first", {});
        const second = createHistoryEntry("second", {});

        const { history, index } = pushHistoryEntry([first], 0, second);

        expect(history).toEqual([first, second]);
        expect(index).toBe(1);
    });

    it("discards forward entries when pushing after navigating back", () => {
        const a = createHistoryEntry("a", {});
        const b = createHistoryEntry("b", {});
        const c = createHistoryEntry("c", {});
        const newEntry = createHistoryEntry("new", {});

        // Simulate: loaded a, b, c, then navigated back to a (index 0).
        const { history, index } = pushHistoryEntry([a, b, c], 0, newEntry);

        expect(history).toEqual([a, newEntry]);
        expect(index).toBe(1);
    });

    it("does not mutate the input history array", () => {
        const a = createHistoryEntry("a", {});
        const original = [a];
        pushHistoryEntry(original, 0, createHistoryEntry("b", {}));
        expect(original).toEqual([a]);
    });
});

describe("canGoBack / canGoForward", () => {
    it("canGoBack is false at the start of history, true otherwise", () => {
        expect(canGoBack(0)).toBe(false);
        expect(canGoBack(1)).toBe(true);
    });

    it("canGoForward is false at the end of history, true otherwise", () => {
        const history = [createHistoryEntry("a", {}), createHistoryEntry("b", {})];
        expect(canGoForward(history, 1)).toBe(false);
        expect(canGoForward(history, 0)).toBe(true);
    });
});

describe("visibleColumnsEqual", () => {
    it("is true for two sets with the same members, regardless of insertion order", () => {
        expect(visibleColumnsEqual(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    });

    it("is false for sets of different sizes", () => {
        expect(visibleColumnsEqual(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
    });

    it("is false for same-size sets with different members", () => {
        expect(visibleColumnsEqual(new Set(["a"]), new Set(["b"]))).toBe(false);
    });

    it("is false if either side is null", () => {
        expect(visibleColumnsEqual(null, new Set())).toBe(false);
        expect(visibleColumnsEqual(new Set(), null)).toBe(false);
        expect(visibleColumnsEqual(null, null)).toBe(false);
    });
});

describe("isEntryCacheValid", () => {
    it("is false for a never-fetched entry", () => {
        const entry = createHistoryEntry("{}", {});
        expect(isEntryCacheValid(entry, new Set())).toBe(false);
    });

    it("is true once fetched under the exact same visibleColumns", () => {
        const entry = createHistoryEntry("{}", {});
        entry.deps = [];
        entry.devDeps = [];
        entry.visibleColumnsSnapshot = new Set(["vulnerabilityCount"]);

        expect(isEntryCacheValid(entry, new Set(["vulnerabilityCount"]))).toBe(true);
    });

    it("is false when visibleColumns has changed since the entry was fetched", () => {
        const entry = createHistoryEntry("{}", {});
        entry.deps = [];
        entry.devDeps = [];
        entry.visibleColumnsSnapshot = new Set(["vulnerabilityCount"]);

        expect(isEntryCacheValid(entry, new Set())).toBe(false);
    });
});
