import { describe, it, expect, vi } from "vitest";
import { memoizeAsync } from "../../../../src/core/utils/memoizeAsync";

describe("memoizeAsync", () => {
    it("caches resolved value by key, calls fn once", async () => {
        const cache = new Map<string, Promise<number>>();
        const fn = vi.fn(async () => 42);

        const first = await memoizeAsync(cache, "key", fn);
        const second = await memoizeAsync(cache, "key", fn);

        expect(first).toBe(42);
        expect(second).toBe(42);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("coalesces concurrent same-key calls into one fn call", async () => {
        const cache = new Map<string, Promise<number>>();
        let resolveFn: (value: number) => void;
        const fn = vi.fn(
            () =>
                new Promise<number>((resolve) => {
                    resolveFn = resolve;
                }),
        );

        const first = memoizeAsync(cache, "key", fn);
        const second = memoizeAsync(cache, "key", fn);
        resolveFn!(7);

        expect(await first).toBe(7);
        expect(await second).toBe(7);
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it("keeps cache separate per key", async () => {
        const cache = new Map<string, Promise<number>>();
        const fn = vi.fn(async () => 1);

        await memoizeAsync(cache, "a", fn);
        await memoizeAsync(cache, "b", fn);

        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("evicts failed lookup, next same-key call retries", async () => {
        const cache = new Map<string, Promise<number>>();
        const fn = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce(9);

        await expect(memoizeAsync(cache, "key", fn)).rejects.toThrow("fail");
        const result = await memoizeAsync(cache, "key", fn);

        expect(result).toBe(9);
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("keeps newer request on late failure of cleared one", async () => {
        const cache = new Map<string, Promise<number>>();
        let rejectStale: (error: Error) => void;
        const stale = memoizeAsync(
            cache,
            "key",
            () =>
                new Promise<number>((_resolve, reject) => {
                    rejectStale = reject;
                }),
        );
        cache.clear();
        const fresh = memoizeAsync(cache, "key", async () => 5);

        rejectStale!(new Error("late"));
        await expect(stale).rejects.toThrow("late");

        expect(cache.get("key")).toBe(fresh);
    });
});
