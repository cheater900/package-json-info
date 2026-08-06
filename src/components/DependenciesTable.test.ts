import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DependenciesTable from "./DependenciesTable.vue";

const fullDependency = {
  name: "left-pad",
  version: "1.2.0",
  versionDate: "2020-01-01T00:00:00.000Z",
  latestVersion: "1.3.0",
  latestReleaseDate: "2021-01-01T00:00:00.000Z",
  latestUpdateDate: "2021-06-01T00:00:00.000Z",
  weeklyDownloads: 4242,
  sourceCode: "https://github.com/left-pad/left-pad",
  gitStars: 99,
  openPRs: 2,
  closedPRs: 10,
  openIssues: 3,
  closedIssues: 20,
  dependencies: ["a", "b"],
};

const sparseDependency = {
  name: "no-data-pkg",
  version: "0.0.1",
  versionDate: null,
  latestVersion: null,
  latestReleaseDate: null,
  latestUpdateDate: null,
  weeklyDownloads: null,
  sourceCode: null,
  gitStars: null,
  openPRs: null,
  closedPRs: null,
  openIssues: null,
  closedIssues: null,
  dependencies: null,
};

describe("DependenciesTable", () => {
  it("every header column has a matching data cell in each row", () => {
    const wrapper = mount(DependenciesTable, {
      props: { dependencies: [fullDependency] },
    });

    const headerCount = wrapper.findAll("thead th").length;
    const rowCellCounts = wrapper.findAll("tbody tr").map((row) => row.findAll("td").length);

    expect(headerCount).toBeGreaterThan(0);
    for (const count of rowCellCounts) {
      expect(count).toBe(headerCount);
    }
  });

  it("renders a full row of dependency data", () => {
    const wrapper = mount(DependenciesTable, {
      props: { dependencies: [fullDependency] },
    });

    const text = wrapper.text();
    expect(text).toContain("left-pad");
    expect(text).toContain("4242");
    expect(text).toContain("99");
    expect(text).toContain("a, b");
    expect(wrapper.find('a[href="https://github.com/left-pad/left-pad"]').exists()).toBe(true);
  });

  it("renders '-' placeholders for every missing field instead of blank cells", () => {
    const wrapper = mount(DependenciesTable, {
      props: { dependencies: [sparseDependency] },
    });

    const cells = wrapper.findAll("tbody td");
    // name/version are always present; every other cell should fall back to '-'
    const fallbackCells = cells.slice(2);
    for (const cell of fallbackCells) {
      expect(cell.text()).toBe("-");
    }
    expect(wrapper.find("tbody a").exists()).toBe(false);
  });

  it("renders one row per dependency", () => {
    const wrapper = mount(DependenciesTable, {
      props: { dependencies: [fullDependency, sparseDependency] },
    });

    expect(wrapper.findAll("tbody tr")).toHaveLength(2);
  });

  it("renders no rows for an empty dependency list", () => {
    const wrapper = mount(DependenciesTable, {
      props: { dependencies: [] },
    });

    expect(wrapper.findAll("tbody tr")).toHaveLength(0);
  });
});
