import { describe, it, expect } from "vitest";
import { isVersionOutdated } from "../../../src/utils/semver";

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
