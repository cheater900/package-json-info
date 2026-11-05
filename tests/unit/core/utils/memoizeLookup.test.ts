import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { configureCore } from "../../../../src/core/runtime";
import { memoizeLookup } from "../../../../src/core/utils/memoizeLookup";
import type { Lookup, LookupStore } from "../../../../src/core/utils/memoizeLookup";

const LIVE_ERROR = new Error("offline");

/** Plain fns, not vi.fn: vi.fn handles returned promises, hiding unhandled rejections. */
function rejectingStore() {
    const calls: unknown[][] = [];
    const store: LookupStore = {
        load: (...args) => {
            calls.push(["load", ...args]);
            return Promise.reject(new Error("store broken"));
        },
        save: (...args) => {
            calls.push(["save", ...args]);
            return Promise.reject(new Error("store broken"));
        },
        generation: () => 0,
    };
    return { store, calls };
}

describe("memoizeLookup with rejecting store", () => {
    it("throws live error when load rejects", async () => {
        const { store, calls } = rejectingStore();
        configureCore({ lookupStore: store });
        const cache = new Map<string, Promise<Lookup<number>>>();

        const request = memoizeLookup(cache, "repoStars", "o/r", z.number(), () =>
            Promise.reject(LIVE_ERROR),
        );

        await expect(request).rejects.toBe(LIVE_ERROR);
        expect(calls).toEqual([["load", "repoStars", "o/r"]]);
    });

    it("returns fresh value without unhandled rejection when save rejects", async () => {
        const unhandled = vi.fn();
        process.on("unhandledRejection", unhandled);
        const { store, calls } = rejectingStore();
        configureCore({ lookupStore: store });
        const cache = new Map<string, Promise<Lookup<number>>>();

        const lookup = await memoizeLookup(cache, "repoStars", "o/r", z.number(), async () => 5);

        expect(lookup).toEqual({ value: 5, staleSince: null });
        expect(calls).toEqual([["save", "repoStars", "o/r", 5, 0]]);
        await new Promise((resolve) => setTimeout(resolve));
        process.off("unhandledRejection", unhandled);
        expect(unhandled).not.toHaveBeenCalled();
    });
});
