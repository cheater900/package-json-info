import { describe, it, expect } from "vitest";
import {
    createHistoryEntry,
    pushHistoryEntry,
    canGoBack,
    canGoForward,
    columnsMissingFrom,
    entryCoversColumns,
    isEntryCacheValid,
} from "../../../../src/app/utils/packageJsonHistory";
import type { DependencyRow } from "../../../../src/core/types";
import { fullDependency } from "../../../fixtures/dependencies";
import { rootWorkspaceContext } from "../../../fixtures/workspaces";

describe("createHistoryEntry", () => {
    it("starts with unfetched deps/devDeps, no visibleColumns snapshot", () => {
        const entry = createHistoryEntry("{}", { name: "demo" });
        expect(entry).toEqual({
            content: "{}",
            pkg: { name: "demo" },
            workspace: null,
            source: null,
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

describe("createHistoryEntry with source", () => {
    it("keeps given source", () => {
        const source = { kind: "url", url: "https://a.example/package.json" } as const;

        expect(createHistoryEntry("{}", {}, null, source).source).toBe(source);
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

describe("columnsMissingFrom", () => {
    it("returns visible keys absent from snapshot", () => {
        expect(columnsMissingFrom(new Set(["a", "b"]), new Set(["b", "c"]))).toEqual(
            new Set(["c"]),
        );
    });

    it("returns empty set for visible subset of snapshot", () => {
        expect(columnsMissingFrom(new Set(["a", "b"]), new Set(["a"]))).toEqual(new Set());
    });

    it("returns every visible key for null snapshot", () => {
        expect(columnsMissingFrom(null, new Set(["a", "b"]))).toEqual(new Set(["a", "b"]));
    });
});

describe("entryCoversColumns", () => {
    function entryFetchedWith(snapshot: ReadonlySet<string> | null) {
        const entry = createHistoryEntry("{}", {});
        entry.deps = [];
        entry.devDeps = [];
        entry.visibleColumnsSnapshot = snapshot;
        return entry;
    }

    it("returns true for visible subset of fetch columns", () => {
        expect(entryCoversColumns(entryFetchedWith(new Set(["a", "b"])), new Set(["a"]))).toBe(
            true,
        );
    });

    it("returns false for column absent at fetch", () => {
        expect(entryCoversColumns(entryFetchedWith(new Set(["a"])), new Set(["a", "b"]))).toBe(
            false,
        );
    });

    it("returns false for null snapshot", () => {
        expect(entryCoversColumns(entryFetchedWith(null), new Set())).toBe(false);
    });

    it("returns false for never-fetched entry", () => {
        expect(entryCoversColumns(createHistoryEntry("{}", {}), new Set())).toBe(false);
    });
});

describe("isEntryCacheValid", () => {
    const COLUMNS_AT_FETCH = new Set(["vulnerabilityCount"]);

    /** Entry fetched under COLUMNS_AT_FETCH, with `deps` and no devDeps. */
    function fetchedEntry(deps: DependencyRow[] = []) {
        const entry = createHistoryEntry("{}", {});
        entry.deps = deps;
        entry.devDeps = [];
        entry.visibleColumnsSnapshot = COLUMNS_AT_FETCH;
        return entry;
    }

    it("returns false for never-fetched entry", () => {
        const entry = createHistoryEntry("{}", {});
        expect(isEntryCacheValid(entry, new Set())).toBe(false);
    });

    it("returns true once fetched under same visibleColumns", () => {
        expect(isEntryCacheValid(fetchedEntry(), new Set(COLUMNS_AT_FETCH))).toBe(true);
    });

    it("returns false for column shown since fetch", () => {
        expect(isEntryCacheValid(fetchedEntry(), new Set(["license"]))).toBe(false);
    });

    it("returns true for column hidden since fetch", () => {
        expect(isEntryCacheValid(fetchedEntry(), new Set())).toBe(true);
    });

    it("returns false for stale row, so revisit retries", () => {
        const entry = fetchedEntry([{ ...fullDependency, staleSince: "2024-01-01T00:00:00.000Z" }]);

        expect(isEntryCacheValid(entry, new Set(COLUMNS_AT_FETCH))).toBe(false);
    });

    it("returns false for row with failed lookups, so revisit retries", () => {
        const entry = fetchedEntry([
            { ...fullDependency, failedLookups: { weeklyDownloads: "Request failed" } },
        ]);

        expect(isEntryCacheValid(entry, new Set(COLUMNS_AT_FETCH))).toBe(false);
    });

    it("returns true for live rows", () => {
        expect(isEntryCacheValid(fetchedEntry([fullDependency]), new Set(COLUMNS_AT_FETCH))).toBe(
            true,
        );
    });
});
