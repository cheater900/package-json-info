import { describe, it, expect } from "vitest";
import {
    createHistoryEntry,
    pushHistoryEntry,
    canGoBack,
    canGoForward,
    visibleColumnsEqual,
    isEntryCacheValid,
} from "../../../src/utils/packageJsonHistory";
import { rootWorkspaceContext } from "../../fixtures/workspaces";

describe("createHistoryEntry", () => {
    it("starts with unfetched deps/devDeps, no visibleColumns snapshot", () => {
        const entry = createHistoryEntry("{}", { name: "demo" });
        expect(entry).toEqual({
            content: "{}",
            pkg: { name: "demo" },
            workspace: null,
            deps: null,
            devDeps: null,
            visibleColumnsSnapshot: null,
        });
    });
});

describe("createHistoryEntry with workspace", () => {
    it("keeps given workspace context", () => {
        expect(createHistoryEntry("{}", {}, rootWorkspaceContext).workspace).toBe(
            rootWorkspaceContext,
        );
    });
});

describe("pushHistoryEntry", () => {
    it("appends to empty history, points index there", () => {
        const entry = createHistoryEntry("{}", {});
        const { history, index } = pushHistoryEntry([], -1, entry);

        expect(history).toEqual([entry]);
        expect(index).toBe(0);
    });

    it("appends after current index, keeps earlier entries", () => {
        const first = createHistoryEntry("first", {});
        const second = createHistoryEntry("second", {});

        const { history, index } = pushHistoryEntry([first], 0, second);

        expect(history).toEqual([first, second]);
        expect(index).toBe(1);
    });

    it("discards forward entries on push after back", () => {
        const a = createHistoryEntry("a", {});
        const b = createHistoryEntry("b", {});
        const c = createHistoryEntry("c", {});
        const newEntry = createHistoryEntry("new", {});

        // Simulate: loaded a, b, c, then navigated back to a (index 0).
        const { history, index } = pushHistoryEntry([a, b, c], 0, newEntry);

        expect(history).toEqual([a, newEntry]);
        expect(index).toBe(1);
    });

    it("keeps input history array unmutated", () => {
        const a = createHistoryEntry("a", {});
        const original = [a];
        pushHistoryEntry(original, 0, createHistoryEntry("b", {}));
        expect(original).toEqual([a]);
    });
});

describe("canGoBack / canGoForward", () => {
    it("canGoBack false at history start, else true", () => {
        expect(canGoBack(0)).toBe(false);
        expect(canGoBack(1)).toBe(true);
    });

    it("canGoForward false at history end, else true", () => {
        const history = [createHistoryEntry("a", {}), createHistoryEntry("b", {})];
        expect(canGoForward(history, 1)).toBe(false);
        expect(canGoForward(history, 0)).toBe(true);
    });
});

describe("visibleColumnsEqual", () => {
    it("returns true for sets with same members in any order", () => {
        expect(visibleColumnsEqual(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    });

    it("returns false for sets of different sizes", () => {
        expect(visibleColumnsEqual(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
    });

    it("returns false for same-size sets with different members", () => {
        expect(visibleColumnsEqual(new Set(["a"]), new Set(["b"]))).toBe(false);
    });

    it("returns false for null on either side", () => {
        expect(visibleColumnsEqual(null, new Set())).toBe(false);
        expect(visibleColumnsEqual(new Set(), null)).toBe(false);
        expect(visibleColumnsEqual(null, null)).toBe(false);
    });
});

describe("isEntryCacheValid", () => {
    it("returns false for never-fetched entry", () => {
        const entry = createHistoryEntry("{}", {});
        expect(isEntryCacheValid(entry, new Set())).toBe(false);
    });

    it("returns true once fetched under same visibleColumns", () => {
        const entry = createHistoryEntry("{}", {});
        entry.deps = [];
        entry.devDeps = [];
        entry.visibleColumnsSnapshot = new Set(["vulnerabilityCount"]);

        expect(isEntryCacheValid(entry, new Set(["vulnerabilityCount"]))).toBe(true);
    });

    it("returns false for visibleColumns changed since fetch", () => {
        const entry = createHistoryEntry("{}", {});
        entry.deps = [];
        entry.devDeps = [];
        entry.visibleColumnsSnapshot = new Set(["vulnerabilityCount"]);

        expect(isEntryCacheValid(entry, new Set())).toBe(false);
    });
});
