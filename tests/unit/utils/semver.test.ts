import { describe, it, expect } from "vitest";
import { isVersionOutdated, parseLeadingSemver, compareSemver } from "../../../src/utils/semver";

describe("isVersionOutdated", () => {
    it("returns false when the declared version matches the latest", () => {
        expect(isVersionOutdated("^3.5.34", "3.5.34")).toBe(false);
        expect(isVersionOutdated("3.5.34", "3.5.34")).toBe(false);
    });

    it("returns true when the declared version is behind the latest", () => {
        expect(isVersionOutdated("^3.5.34", "3.6.0")).toBe(true);
        expect(isVersionOutdated("~1.0.0", "2.0.0")).toBe(true);
    });

    it("returns false when the declared version is ahead of the latest (unusual, but not outdated)", () => {
        expect(isVersionOutdated("2.0.0", "1.9.9")).toBe(false);
    });

    it("returns null when either version can't be parsed", () => {
        expect(isVersionOutdated("workspace:*", "1.0.0")).toBeNull();
        expect(isVersionOutdated("1.0.0", null)).toBeNull();
        expect(isVersionOutdated(null, "1.0.0")).toBeNull();
        expect(isVersionOutdated(undefined, undefined)).toBeNull();
    });
});

describe("parseLeadingSemver", () => {
    it("extracts major.minor.patch from a plain version", () => {
        expect(parseLeadingSemver("3.5.34")).toEqual([3, 5, 34]);
    });

    it("extracts the leading version from a range-prefixed string", () => {
        expect(parseLeadingSemver("^3.5.34")).toEqual([3, 5, 34]);
        expect(parseLeadingSemver("~1.0.0")).toEqual([1, 0, 0]);
        expect(parseLeadingSemver(">=2.1.0 <3.0.0")).toEqual([2, 1, 0]);
    });

    it("returns null when no major.minor.patch triplet is present", () => {
        expect(parseLeadingSemver("workspace:*")).toBeNull();
        expect(parseLeadingSemver("latest")).toBeNull();
        expect(parseLeadingSemver("")).toBeNull();
    });
});

describe("compareSemver", () => {
    it("returns 0 for equal tuples", () => {
        expect(compareSemver([1, 2, 3], [1, 2, 3])).toBe(0);
    });

    it("compares major first, regardless of minor/patch", () => {
        expect(compareSemver([2, 0, 0], [1, 9, 9])).toBeGreaterThan(0);
        expect(compareSemver([1, 9, 9], [2, 0, 0])).toBeLessThan(0);
    });

    it("falls back to minor when major is equal", () => {
        expect(compareSemver([1, 3, 0], [1, 2, 9])).toBeGreaterThan(0);
        expect(compareSemver([1, 2, 9], [1, 3, 0])).toBeLessThan(0);
    });

    it("falls back to patch when major and minor are equal", () => {
        expect(compareSemver([1, 2, 4], [1, 2, 3])).toBeGreaterThan(0);
        expect(compareSemver([1, 2, 3], [1, 2, 4])).toBeLessThan(0);
    });
});
