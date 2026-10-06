import { describe, it, expect, vi, afterEach } from "vitest";
import { readPositiveInt } from "../../src/config";

afterEach(() => {
    vi.restoreAllMocks();
});

describe("readPositiveInt", () => {
    it("returns fallback for missing or blank value", () => {
        expect(readPositiveInt("X", undefined, 5)).toBe(5);
        expect(readPositiveInt("X", "  ", 5)).toBe(5);
    });

    it("parses positive integer", () => {
        expect(readPositiveInt("X", "12", 5)).toBe(12);
    });

    it("warns and returns fallback for zero, negative, fraction, text", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

        for (const raw of ["0", "-3", "2.5", "abc"]) {
            expect(readPositiveInt("X", raw, 5)).toBe(5);
        }
        expect(warn).toHaveBeenCalledTimes(4);
    });
});
