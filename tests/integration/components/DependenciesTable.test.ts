import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import DependenciesTable from "../../../src/components/DependenciesTable.vue";

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
    license: "MIT",
    isOutdated: true,
    deprecated: null,
    vulnerabilityCount: 0,
    bundleSizeGzip: 15360,
    maintainers: ["alice", "bob"],
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
    license: null,
    isOutdated: null,
    deprecated: null,
    vulnerabilityCount: null,
    bundleSizeGzip: null,
    maintainers: null,
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
        expect(text).toContain("MIT");
        expect(text).toContain("Yes"); // outdated
        expect(text).toContain("15.0 KB");
        expect(text).toContain("alice, bob");
        expect(wrapper.find('a[href="https://github.com/left-pad/left-pad"]').exists()).toBe(true);
        // MIT is permissive: no license warning marker
        expect(text).not.toContain("MIT ⚠");
    });

    it("renders '-' placeholders for every missing field instead of blank cells", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [sparseDependency] },
        });

        const headerLabels = wrapper.findAll("thead th").map((th) =>
            th
                .text()
                .replace(/[▲▼]$/, "")
                .trim(),
        );
        const cells = wrapper.findAll("tbody td");
        const licenseIndex = headerLabels.indexOf("License");
        const loadIndex = headerLabels.indexOf("Load");

        // name/version are always present; every other cell should fall back to
        // '-', except License (marks a missing license with a warning) and
        // Load (always renders its button, regardless of dependency data).
        cells.forEach((cell, index) => {
            if (index === 0 || index === 1 || index === loadIndex) return;
            if (index === licenseIndex) {
                expect(cell.text()).toBe("- ⚠");
            } else {
                expect(cell.text()).toBe("-");
            }
        });
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

describe("DependenciesTable load-as-input action", () => {
    it("renders a Load column as the last header, with a Load button per row", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency] },
        });

        const headerTexts = wrapper.findAll("thead th").map((th) => th.text());
        expect(headerTexts[headerTexts.length - 1]).toBe("Load");

        const lastCell = wrapper.find("tbody tr").findAll("td").at(-1)!;
        expect(lastCell.find("button").text()).toBe("Load");
    });

    it("emits load-package with the row's name and version when clicked", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency] },
        });

        const lastCell = wrapper.find("tbody tr").findAll("td").at(-1)!;
        await lastCell.find("button").trigger("click");

        expect(wrapper.emitted("load-package")).toEqual([[{ name: "left-pad", version: "1.2.0" }]]);
    });

    it("stays visible even if 'loadAction' is passed in hiddenColumns", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], hiddenColumns: new Set(["loadAction"]) },
        });

        const headerTexts = wrapper.findAll("thead th").map((th) => th.text());
        expect(headerTexts).toContain("Load");
    });
});

describe("DependenciesTable column visibility", () => {
    it("shows every column by default", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency] },
        });

        const headerTexts = wrapper.findAll("thead th").map((th) => th.text());
        expect(headerTexts).toContain("License");
        expect(headerTexts).toContain("Maintainers");
    });

    it("hides a column named in hiddenColumns, from both the header and every row", () => {
        const wrapper = mount(DependenciesTable, {
            props: {
                dependencies: [fullDependency, sparseDependency],
                hiddenColumns: new Set(["license"]),
            },
        });

        const headerTexts = wrapper.findAll("thead th").map((th) => th.text());
        expect(headerTexts).toContain("Maintainers");
        expect(headerTexts.some((t) => t.startsWith("License"))).toBe(false);
        expect(wrapper.text()).not.toContain("MIT");
    });

    it("never hides the Name column even if asked to", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], hiddenColumns: new Set(["name"]) },
        });

        const headerTexts = wrapper.findAll("thead th").map((th) => th.text());
        expect(headerTexts.some((t) => t.startsWith("Name"))).toBe(true);
        expect(wrapper.find("tbody td").text()).toBe("left-pad");
    });

    it("keeps header and row cell counts in sync when columns are hidden", () => {
        const wrapper = mount(DependenciesTable, {
            props: {
                dependencies: [fullDependency],
                hiddenColumns: new Set(["license", "maintainers", "sourceCode"]),
            },
        });

        const headerCount = wrapper.findAll("thead th").length;
        const rowCellCount = wrapper.findAll("tbody td").length;
        expect(headerCount).toBe(rowCellCount);
        expect(headerCount).toBeLessThan(20);
    });
});

describe("DependenciesTable sorting", () => {
    const pkgA = { ...sparseDependency, name: "aaa", weeklyDownloads: 100, gitStars: 5 };
    const pkgB = { ...sparseDependency, name: "bbb", weeklyDownloads: 300, gitStars: null };
    const pkgC = { ...sparseDependency, name: "ccc", weeklyDownloads: 200, gitStars: 15 };

    function names(wrapper) {
        return wrapper.findAll("tbody tr td:first-child").map((td) => td.text());
    }

    function sortButton(wrapper, label) {
        const button = wrapper.findAll("th button").find((b) => b.text().startsWith(label));
        if (!button) throw new Error(`No sort button found for column "${label}"`);
        return button;
    }

    it("keeps the original prop order until a column header is clicked", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [pkgC, pkgA, pkgB] },
        });

        expect(names(wrapper)).toEqual(["ccc", "aaa", "bbb"]);
    });

    it("sorts ascending on first click and descending on a second click of the same column", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [pkgC, pkgA, pkgB] },
        });

        await sortButton(wrapper, "Weekly downloads").trigger("click");
        expect(names(wrapper)).toEqual(["aaa", "ccc", "bbb"]);

        await sortButton(wrapper, "Weekly downloads").trigger("click");
        expect(names(wrapper)).toEqual(["bbb", "ccc", "aaa"]);
    });

    it("shows an ascending/descending indicator only on the active sort column", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [pkgC, pkgA, pkgB] },
        });

        await sortButton(wrapper, "Name").trigger("click");
        expect(sortButton(wrapper, "Name").text()).toBe("Name ▲");
        expect(sortButton(wrapper, "Weekly downloads").text()).toBe("Weekly downloads");

        await sortButton(wrapper, "Name").trigger("click");
        expect(sortButton(wrapper, "Name").text()).toBe("Name ▼");
    });

    it("switching to a different column resets to ascending", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [pkgC, pkgA, pkgB] },
        });

        await sortButton(wrapper, "Weekly downloads").trigger("click");
        await sortButton(wrapper, "Weekly downloads").trigger("click");
        await sortButton(wrapper, "Name").trigger("click");

        expect(names(wrapper)).toEqual(["aaa", "bbb", "ccc"]);
        expect(sortButton(wrapper, "Name").text()).toBe("Name ▲");
    });

    it("always sorts missing values last, in both directions", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [pkgC, pkgA, pkgB] },
        });

        await sortButton(wrapper, "Git stars").trigger("click");
        expect(names(wrapper)).toEqual(["aaa", "ccc", "bbb"]);

        await sortButton(wrapper, "Git stars").trigger("click");
        expect(names(wrapper)).toEqual(["ccc", "aaa", "bbb"]);
    });

    it("does not render a sort button for non-sortable columns", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [pkgA] },
        });

        const headerTexts = wrapper.findAll("thead th").map((th) => th.text());
        for (const label of [
            "Version",
            "Source code",
            "Dependencies",
            "License",
            "Deprecated",
            "Maintainers",
        ]) {
            expect(headerTexts).toContain(label);
            expect(wrapper.findAll("th button").some((b) => b.text() === label)).toBe(false);
        }
    });

    it("sorts by vulnerability count, keeping unknown counts last", async () => {
        const withVulns = { ...sparseDependency, name: "aaa", vulnerabilityCount: 3 };
        const withoutVulns = { ...sparseDependency, name: "bbb", vulnerabilityCount: 0 };
        const unknownVulns = { ...sparseDependency, name: "ccc", vulnerabilityCount: null };
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [withVulns, withoutVulns, unknownVulns] },
        });

        await sortButton(wrapper, "Vulnerabilities").trigger("click");

        expect(names(wrapper)).toEqual(["bbb", "aaa", "ccc"]);
    });
});

describe("DependenciesTable search", () => {
    const react = { ...sparseDependency, name: "react" };
    const reactDom = { ...sparseDependency, name: "react-dom" };
    const vue = { ...sparseDependency, name: "vue" };

    function names(wrapper) {
        return wrapper.findAll("tbody tr td:first-child").map((td) => td.text());
    }

    function searchInput(wrapper) {
        return wrapper.get('input[type="text"]');
    }

    it("shows every row when the search box is empty", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue] },
        });

        expect(names(wrapper)).toEqual(["react", "react-dom", "vue"]);
    });

    it("filters rows to names containing the query, case-insensitively", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue] },
        });

        await searchInput(wrapper).setValue("REACT");

        expect(names(wrapper)).toEqual(["react", "react-dom"]);
    });

    it("matches a substring anywhere in the name, not just a prefix", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue] },
        });

        await searchInput(wrapper).setValue("dom");

        expect(names(wrapper)).toEqual(["react-dom"]);
    });

    it("shows no rows when nothing matches", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue] },
        });

        await searchInput(wrapper).setValue("no-such-package");

        expect(wrapper.findAll("tbody tr")).toHaveLength(0);
    });

    it("treats a whitespace-only query as empty", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue] },
        });

        await searchInput(wrapper).setValue("   ");

        expect(names(wrapper)).toEqual(["react", "react-dom", "vue"]);
    });

    it("applies sorting on top of the filtered results", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [reactDom, react] },
        });

        await searchInput(wrapper).setValue("react");
        await wrapper
            .findAll("th button")
            .find((b) => b.text().startsWith("Name"))!
            .trigger("click");

        expect(names(wrapper)).toEqual(["react", "react-dom"]);
    });
});
