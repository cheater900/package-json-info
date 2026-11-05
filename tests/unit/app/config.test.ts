import { describe, it, expect, vi } from "vitest";
import { isConfigInt, readPositiveInt } from "../../../src/app/config";
import { MAX_CONFIG_INT } from "../../../src/app/constants";

const FALLBACK = 5;

describe("isConfigInt", () => {
    it.each([1, MAX_CONFIG_INT])("accepts %s", (value) => {
        expect(isConfigInt(value)).toBe(true);
    });

    it.each([0, -1, 1.5, MAX_CONFIG_INT + 1, Number.NaN, Number.POSITIVE_INFINITY])(
        "rejects %s",
        (value) => {
            expect(isConfigInt(value)).toBe(false);
        },
    );
});

describe("readPositiveInt", () => {
    it.each([undefined, "  "])("returns fallback for missing or blank value %j", (raw) => {
        expect(readPositiveInt("X", raw, FALLBACK)).toBe(FALLBACK);
    });

    it.each(["12", String(MAX_CONFIG_INT)])("parses positive integer %s", (raw) => {
        expect(readPositiveInt("X", raw, FALLBACK)).toBe(Number(raw));
    });

    it.each(["0", "-3", "2.5", "abc", String(MAX_CONFIG_INT + 1), "1e20"])(
        "warns, returns fallback for invalid %s",
        (raw) => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

            expect(readPositiveInt("X", raw, FALLBACK)).toBe(FALLBACK);
            expect(warn).toHaveBeenCalledOnce();
        },
    );
});
