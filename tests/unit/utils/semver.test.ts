import { describe, it, expect } from "vitest";
import {
    isVersionOutdated,
    parseLeadingSemver,
    compareSemver,
    pinnedVersionOf,
} from "../../../src/utils/semver";

describe("isVersionOutdated", () => {
    it("returns false for declared version equal to latest", () => {
        expect(isVersionOutdated("^3.5.34", "3.5.34")).toBe(false);
        expect(isVersionOutdated("3.5.34", "3.5.34")).toBe(false);
    });

    it("returns true for declared version behind latest", () => {
        expect(isVersionOutdated("^3.5.34", "3.6.0")).toBe(true);
        expect(isVersionOutdated("~1.0.0", "2.0.0")).toBe(true);
    });

    it("returns false for declared version ahead of latest", () => {
        expect(isVersionOutdated("2.0.0", "1.9.9")).toBe(false);
    });

    it("returns null for unparseable version", () => {
        expect(isVersionOutdated("workspace:*", "1.0.0")).toBeNull();
        expect(isVersionOutdated("1.0.0", null)).toBeNull();
        expect(isVersionOutdated(null, "1.0.0")).toBeNull();
        expect(isVersionOutdated(undefined, undefined)).toBeNull();
    });
});

describe("parseLeadingSemver", () => {
    it("extracts major.minor.patch from plain version", () => {
        expect(parseLeadingSemver("3.5.34")).toEqual([3, 5, 34]);
    });

    it("extracts leading version from range-prefixed string", () => {
        expect(parseLeadingSemver("^3.5.34")).toEqual([3, 5, 34]);
        expect(parseLeadingSemver("~1.0.0")).toEqual([1, 0, 0]);
        expect(parseLeadingSemver(">=2.1.0 <3.0.0")).toEqual([2, 1, 0]);
    });

    it("returns null without major.minor.patch triplet", () => {
        expect(parseLeadingSemver("workspace:*")).toBeNull();
        expect(parseLeadingSemver("latest")).toBeNull();
        expect(parseLeadingSemver("")).toBeNull();
    });
});

describe("compareSemver", () => {
    it("returns 0 for equal tuples", () => {
        expect(compareSemver([1, 2, 3], [1, 2, 3])).toBe(0);
    });

    it("compares major first, ignores minor/patch", () => {
        expect(compareSemver([2, 0, 0], [1, 9, 9])).toBeGreaterThan(0);
        expect(compareSemver([1, 9, 9], [2, 0, 0])).toBeLessThan(0);
    });

    it("falls back to minor for equal major", () => {
        expect(compareSemver([1, 3, 0], [1, 2, 9])).toBeGreaterThan(0);
        expect(compareSemver([1, 2, 9], [1, 3, 0])).toBeLessThan(0);
    });

    it("falls back to patch for equal major and minor", () => {
        expect(compareSemver([1, 2, 4], [1, 2, 3])).toBeGreaterThan(0);
        expect(compareSemver([1, 2, 3], [1, 2, 4])).toBeLessThan(0);
    });
});

describe("pinnedVersionOf", () => {
    it.each([
        ["^1.2.3", "1.2.3"],
        ["~0.10.0", "0.10.0"],
        ["latest", undefined],
    ])("maps %s to %s", (range, expected) => {
        expect(pinnedVersionOf(range)).toBe(expected);
    });
});
