import { describe, it, expect } from "vitest";
import {
  DEPENDENCY_TABLE_COLUMNS,
  TOGGLEABLE_COLUMNS,
  MIN_VISIBLE_COLUMNS,
  DEFAULT_HIDDEN_COLUMNS,
  isColumnVisible,
  wouldViolateMinVisible,
  toggleColumnVisibility,
} from "./tableColumns";

describe("TOGGLEABLE_COLUMNS", () => {
  it("excludes the Name column", () => {
    expect(TOGGLEABLE_COLUMNS.some((c) => c.key === "name")).toBe(false);
    expect(TOGGLEABLE_COLUMNS.length).toBe(DEPENDENCY_TABLE_COLUMNS.length - 1);
  });
});

describe("DEFAULT_HIDDEN_COLUMNS", () => {
  it("hides only the columns backed by a non-npm, non-repo-host service", () => {
    expect(DEFAULT_HIDDEN_COLUMNS).toEqual(new Set(["vulnerabilityCount", "bundleSizeGzip"]));
  });

  it("keeps every npm-registry- and repo-host-backed column visible by default", () => {
    const expectedVisibleByDefault = [
      "versionDate", "latestVersion", "latestReleaseDate", "latestUpdateDate",
      "isOutdated", "weeklyDownloads", "sourceCode", "gitStars", "openPRs",
      "closedPRs", "openIssues", "closedIssues", "dependencies", "license",
      "deprecated", "maintainers",
    ];
    for (const key of expectedVisibleByDefault) {
      expect(isColumnVisible(DEFAULT_HIDDEN_COLUMNS, key)).toBe(true);
    }
  });

  it("only hides columns that actually exist", () => {
    const columnKeys = new Set(DEPENDENCY_TABLE_COLUMNS.map((c) => c.key));
    for (const key of DEFAULT_HIDDEN_COLUMNS) {
      expect(columnKeys.has(key)).toBe(true);
    }
  });
});

describe("isColumnVisible", () => {
  it("is always true for the Name column, even if somehow present in the hidden set", () => {
    expect(isColumnVisible(new Set(["name"]), "name")).toBe(true);
    expect(isColumnVisible(new Set(), "name")).toBe(true);
  });

  it("reflects membership in the hidden set for other columns", () => {
    expect(isColumnVisible(new Set(["license"]), "license")).toBe(false);
    expect(isColumnVisible(new Set(["license"]), "version")).toBe(true);
  });
});

describe("wouldViolateMinVisible", () => {
  it("is false for an already-hidden column", () => {
    const hidden = new Set(TOGGLEABLE_COLUMNS.slice(1).map((c) => c.key));
    expect(wouldViolateMinVisible(hidden, TOGGLEABLE_COLUMNS[1].key)).toBe(false);
  });

  it("is true when hiding the last remaining non-name column", () => {
    const hidden = new Set(TOGGLEABLE_COLUMNS.slice(1).map((c) => c.key));
    // Only TOGGLEABLE_COLUMNS[0] is still visible alongside Name (2 total).
    expect(wouldViolateMinVisible(hidden, TOGGLEABLE_COLUMNS[0].key)).toBe(true);
  });

  it("is false when more than one non-name column would remain visible", () => {
    const hidden = new Set(TOGGLEABLE_COLUMNS.slice(2).map((c) => c.key));
    // Two non-name columns still visible; hiding one still leaves MIN_VISIBLE_COLUMNS.
    expect(wouldViolateMinVisible(hidden, TOGGLEABLE_COLUMNS[0].key)).toBe(false);
  });
});

describe("toggleColumnVisibility", () => {
  it("never hides the Name column", () => {
    const result = toggleColumnVisibility(new Set(), "name");
    expect(result.has("name")).toBe(false);
  });

  it("hides a currently-visible column", () => {
    const result = toggleColumnVisibility(new Set(), "license");
    expect(result.has("license")).toBe(true);
  });

  it("shows a currently-hidden column", () => {
    const result = toggleColumnVisibility(new Set(["license"]), "license");
    expect(result.has("license")).toBe(false);
  });

  it("refuses to hide the last remaining non-name column", () => {
    const allButOne = new Set(TOGGLEABLE_COLUMNS.slice(1).map((c) => c.key));
    const lastVisibleKey = TOGGLEABLE_COLUMNS[0].key;

    const result = toggleColumnVisibility(allButOne, lastVisibleKey);

    expect(result.has(lastVisibleKey)).toBe(false);
    expect(DEPENDENCY_TABLE_COLUMNS.length - result.size).toBe(MIN_VISIBLE_COLUMNS);
  });

  it("does not mutate the input set", () => {
    const original = new Set(["license"]);
    toggleColumnVisibility(original, "deprecated");
    expect(original).toEqual(new Set(["license"]));
  });
});
