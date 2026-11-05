import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    LOOKUP_DB_NAME,
    LOOKUP_DB_STORE,
    LOOKUP_READ_TIMEOUT_MS,
} from "../../../../src/app/constants";
import { withObjectStore } from "../../../../src/app/utils/indexedDb";
import {
    clearLookups,
    loadLookup,
    lookupStoreGeneration,
    saveLookup,
} from "../../../../src/app/utils/lookupStore";
import { stubIndexedDb } from "../../../helpers/settings";

describe("lookupStore", () => {
    beforeEach(() => {
        stubIndexedDb();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("round-trips value with ISO savedAt", async () => {
        await saveLookup("weeklyDownloads", "left-pad", 4242);

        const stored = await loadLookup<number>("weeklyDownloads", "left-pad");

        expect(stored?.value).toBe(4242);
        expect(new Date(stored?.savedAt ?? "").toISOString()).toBe(stored?.savedAt);
    });

    it("round-trips null value", async () => {
        await saveLookup("bundleSize", "left-pad@1.0.0", null);

        expect(await loadLookup("bundleSize", "left-pad@1.0.0")).toMatchObject({ value: null });
    });

    it("returns undefined on miss", async () => {
        expect(await loadLookup("registry", "left-pad")).toBeUndefined();
    });

    it("keeps kinds apart for same key", async () => {
        await saveLookup("weeklyDownloads", "left-pad", 1);
        await saveLookup("vulnerabilityCount", "left-pad", 2);

        expect((await loadLookup("weeklyDownloads", "left-pad"))?.value).toBe(1);
        expect((await loadLookup("vulnerabilityCount", "left-pad"))?.value).toBe(2);
    });

    it("overwrites older value", async () => {
        await saveLookup("repoStars", "github.com/o/r", 1);
        await saveLookup("repoStars", "github.com/o/r", 2);

        expect((await loadLookup("repoStars", "github.com/o/r"))?.value).toBe(2);
    });

    it("clearLookups drops every record", async () => {
        await saveLookup("weeklyDownloads", "left-pad", 1);
        await saveLookup("repoStars", "github.com/o/r", 2);

        await clearLookups();

        expect(await loadLookup("weeklyDownloads", "left-pad")).toBeUndefined();
        expect(await loadLookup("repoStars", "github.com/o/r")).toBeUndefined();
    });

    it("skips save started before clearLookups", async () => {
        const generation = lookupStoreGeneration();

        await clearLookups();
        await saveLookup("repoStars", "github.com/private/repo", 7, generation);

        expect(await loadLookup("repoStars", "github.com/private/repo")).toBeUndefined();
    });

    it("returns undefined for non-ISO savedAt", async () => {
        await withObjectStore(LOOKUP_DB_NAME, LOOKUP_DB_STORE, "readwrite", (store) =>
            store.put({ value: 1, savedAt: "yesterday" }, "repoStars:github.com/o/r"),
        );

        expect(await loadLookup("repoStars", "github.com/o/r")).toBeUndefined();
    });

    it(`loads undefined once IndexedDB hangs ${LOOKUP_READ_TIMEOUT_MS} ms`, async () => {
        vi.useFakeTimers();
        vi.stubGlobal("indexedDB", { open: () => ({}) });

        const stored = loadLookup("registry", "left-pad");
        await vi.advanceTimersByTimeAsync(LOOKUP_READ_TIMEOUT_MS);

        expect(await stored).toBeUndefined();
    });

    it("swallows failing IndexedDB", async () => {
        vi.stubGlobal("indexedDB", {
            open: () => {
                throw new DOMException("blocked", "SecurityError");
            },
        });

        await expect(saveLookup("registry", "left-pad", {})).resolves.toBeUndefined();
        await expect(clearLookups()).resolves.toBeUndefined();
        expect(await loadLookup("registry", "left-pad")).toBeUndefined();
    });
});

describe("lookupStore without indexedDB", () => {
    it("skips save, loads undefined", async () => {
        expect(typeof indexedDB).toBe("undefined");

        await expect(saveLookup("registry", "left-pad", {})).resolves.toBeUndefined();
        await expect(clearLookups()).resolves.toBeUndefined();
        expect(await loadLookup("registry", "left-pad")).toBeUndefined();
    });
});
