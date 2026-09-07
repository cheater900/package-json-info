import { describe, it, expect } from "vitest";
import {
    fmtDate,
    fmtList,
    fmtOutdated,
    fmtLicense,
    fmtBundleSize,
    formatCell,
    compareValues,
    sortDependencies,
} from "../../../src/utils/dependencyRowFormatting";

describe("fmtDate", () => {
    it("formats a valid date string", () => {
        expect(fmtDate("2024-01-01T00:00:00.000Z")).toBe(
            new Date("2024-01-01T00:00:00.000Z").toDateString(),
        );
    });

    it("returns '-' for a missing date", () => {
        expect(fmtDate(null)).toBe("-");
        expect(fmtDate(undefined)).toBe("-");
        expect(fmtDate("")).toBe("-");
    });
});

describe("fmtList", () => {
    it("joins names with a comma", () => {
        expect(fmtList(["a", "b"])).toBe("a, b");
    });

    it("returns '-' for an empty or missing list", () => {
        expect(fmtList([])).toBe("-");
        expect(fmtList(null)).toBe("-");
        expect(fmtList(undefined)).toBe("-");
    });
});

describe("fmtOutdated", () => {
    it("maps true/false to Yes/No", () => {
        expect(fmtOutdated(true)).toBe("Yes");
        expect(fmtOutdated(false)).toBe("No");
    });

    it("returns '-' when unknown", () => {
        expect(fmtOutdated(null)).toBe("-");
        expect(fmtOutdated(undefined)).toBe("-");
    });
});

describe("fmtLicense", () => {
    it("returns a permissive license unchanged", () => {
        expect(fmtLicense("MIT")).toBe("MIT");
    });

    it("flags a copyleft license with a warning marker", () => {
        expect(fmtLicense("GPL-3.0")).toBe("GPL-3.0 ⚠");
    });

    it("flags a missing license with a warning marker", () => {
        expect(fmtLicense(null)).toBe("- ⚠");
    });
});

describe("fmtBundleSize", () => {
    it("formats gzip bytes as KB", () => {
        expect(fmtBundleSize(15360)).toBe("15.0 KB");
    });

    it("returns '-' when unknown", () => {
        expect(fmtBundleSize(null)).toBe("-");
        expect(fmtBundleSize(undefined)).toBe("-");
    });
});

describe("formatCell", () => {
    it("uses the matching formatter for a column with one", () => {
        expect(formatCell("license", { license: "MIT" })).toBe("MIT");
        expect(formatCell("isOutdated", { isOutdated: true })).toBe("Yes");
    });

    it("falls back to the raw value for a column with no formatter", () => {
        expect(formatCell("version", { version: "1.2.0" })).toBe("1.2.0");
    });

    it("falls back to '-' for a missing value with no formatter", () => {
        expect(formatCell("version", { version: null })).toBe("-");
        expect(formatCell("weeklyDownloads", {})).toBe("-");
    });
});

describe("compareValues", () => {
    it("sorts strings ascending and descending", () => {
        expect(compareValues("a", "b", "asc")).toBeLessThan(0);
        expect(compareValues("a", "b", "desc")).toBeGreaterThan(0);
    });

    it("sorts numbers ascending and descending", () => {
        expect(compareValues(1, 2, "asc")).toBeLessThan(0);
        expect(compareValues(1, 2, "desc")).toBeGreaterThan(0);
    });

    it("always sorts missing values last, regardless of direction", () => {
        expect(compareValues(null, 1, "asc")).toBeGreaterThan(0);
        expect(compareValues(null, 1, "desc")).toBeGreaterThan(0);
        expect(compareValues(1, null, "asc")).toBeLessThan(0);
        expect(compareValues(1, null, "desc")).toBeLessThan(0);
    });

    it("treats two missing values as equal", () => {
        expect(compareValues(null, undefined, "asc")).toBe(0);
    });
});

describe("sortDependencies", () => {
    const a = { name: "aaa", weeklyDownloads: 100, gitStars: 5 };
    const b = { name: "bbb", weeklyDownloads: 300, gitStars: null };
    const c = { name: "ccc", weeklyDownloads: 200, gitStars: 15 };

    it("returns the input unchanged when sortKey is falsy", () => {
        const input = [c, a, b];
        expect(sortDependencies(input, null, "asc")).toBe(input);
    });

    it("sorts ascending by the given key", () => {
        expect(sortDependencies([c, a, b], "weeklyDownloads", "asc")).toEqual([a, c, b]);
    });

    it("sorts descending by the given key", () => {
        expect(sortDependencies([c, a, b], "weeklyDownloads", "desc")).toEqual([b, c, a]);
    });

    it("keeps missing values last regardless of direction", () => {
        expect(sortDependencies([a, b, c], "gitStars", "asc")).toEqual([a, c, b]);
        expect(sortDependencies([a, b, c], "gitStars", "desc")).toEqual([c, a, b]);
    });

    it("does not mutate the input array", () => {
        const input = [c, a, b];
        sortDependencies(input, "weeklyDownloads", "asc");
        expect(input).toEqual([c, a, b]);
    });
});
