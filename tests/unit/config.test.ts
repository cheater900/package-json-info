import { describe, it, expect, vi } from "vitest";
import { readPositiveInt } from "../../src/config";

describe("readPositiveInt", () => {
    it("returns fallback for missing or blank value", () => {
        expect(readPositiveInt("X", undefined, 5)).toBe(5);
        expect(readPositiveInt("X", "  ", 5)).toBe(5);
    });

    it("parses positive integer", () => {
        expect(readPositiveInt("X", "12", 5)).toBe(12);
        expect(readPositiveInt("X", "2147483647", 5)).toBe(2147483647);
    });

    it("warns and returns fallback for zero, negative, fraction, text, timer overflow", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        for (const raw of ["0", "-3", "2.5", "abc", "2147483648", "1e20"]) {
            expect(readPositiveInt("X", raw, 5)).toBe(5);
        }
        expect(warn).toHaveBeenCalledTimes(6);
    });
});
