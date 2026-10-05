import { describe, it, expect, vi } from "vitest";
import { memoizeAsync } from "../../../src/utils/memoizeAsync";

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
});
