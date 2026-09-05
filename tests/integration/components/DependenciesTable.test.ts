import { describe, it, expect } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import draggable from "vuedraggable";
import DependenciesTable from "../../../src/components/DependenciesTable.vue";
import { TOGGLEABLE_COLUMNS } from "../../../src/utils/tableColumns";

/** Every toggleable column key except the given ones - i.e. "everything visible except these". */
function visibleColumnsExcept(...excluded) {
    return new Set(TOGGLEABLE_COLUMNS.map((c) => c.key).filter((key) => !excluded.includes(key)));
}

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
                .replace(/[\s▲▼]+$/, "")
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

    it("stays visible even with an empty visibleColumns set", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], visibleColumns: new Set() },
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

    it("hides a column not named in visibleColumns, from both the header and every row", () => {
        const wrapper = mount(DependenciesTable, {
            props: {
                dependencies: [fullDependency, sparseDependency],
                visibleColumns: visibleColumnsExcept("license"),
            },
        });

        const headerTexts = wrapper.findAll("thead th").map((th) => th.text());
        expect(headerTexts).toContain("Maintainers");
        expect(headerTexts.some((t) => t.startsWith("License"))).toBe(false);
        expect(wrapper.text()).not.toContain("MIT");
    });

    it("never hides the Name column even if asked to", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], visibleColumns: new Set() },
        });

        const headerTexts = wrapper.findAll("thead th").map((th) => th.text());
        expect(headerTexts.some((t) => t.startsWith("Name"))).toBe(true);
        expect(wrapper.find("tbody td").text()).toBe("left-pad");
    });

    it("keeps header and row cell counts in sync when columns are hidden", () => {
        const wrapper = mount(DependenciesTable, {
            props: {
                dependencies: [fullDependency],
                visibleColumns: visibleColumnsExcept("license", "maintainers", "sourceCode"),
            },
        });

        const headerCount = wrapper.findAll("thead th").length;
        const rowCellCount = wrapper.findAll("tbody td").length;
        expect(headerCount).toBe(rowCellCount);
        expect(headerCount).toBeLessThan(20);
    });
});

describe("DependenciesTable column order", () => {
    const reversedOrder = TOGGLEABLE_COLUMNS.map((c) => c.key).reverse();

    function headerLabels(wrapper) {
        return wrapper.findAll("thead th").map((th) =>
            th
                .text()
                .replace(/[\s▲▼]+$/, "")
                .trim(),
        );
    }

    it("renders visible columns in the given columnOrder", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columnOrder: reversedOrder },
        });

        const expectedLabels = [
            "Name",
            ...reversedOrder.map((key) => TOGGLEABLE_COLUMNS.find((c) => c.key === key).label),
            "Load",
        ];
        expect(headerLabels(wrapper)).toEqual(expectedLabels);
    });

    it("falls back to declaration order when columnOrder is omitted", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency] },
        });

        const expectedLabels = ["Name", ...TOGGLEABLE_COLUMNS.map((c) => c.label), "Load"];
        expect(headerLabels(wrapper)).toEqual(expectedLabels);
    });

    it("keeps Name first and Load last regardless of columnOrder content", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columnOrder: reversedOrder },
        });

        const labels = headerLabels(wrapper);
        expect(labels[0]).toBe("Name");
        expect(labels[labels.length - 1]).toBe("Load");
    });

    it("keeps body <td> order in sync with header <th> order for a non-default columnOrder", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columnOrder: reversedOrder },
        });

        // sourceCode's cell renders a link, not text - use its position to
        // cross-check header vs body order instead of comparing raw text.
        const sourceCodeIndex = headerLabels(wrapper).indexOf("Source code");
        const cells = wrapper.findAll("tbody td");
        expect(cells[sourceCodeIndex].find("a").exists()).toBe(true);
    });

    it("emits reorder-columns with the merged full order when the draggable list is reordered", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency] },
        });

        const draggableComponent = wrapper.findComponent(draggable);
        const list = draggableComponent.props("list");
        [list[0], list[1]] = [list[1], list[0]];
        await nextTick();

        const emitted = wrapper.emitted("reorder-columns");
        expect(emitted).toBeTruthy();
        const [newOrder] = emitted[emitted.length - 1];
        expect(newOrder[0]).toBe(TOGGLEABLE_COLUMNS[1].key);
        expect(newOrder[1]).toBe(TOGGLEABLE_COLUMNS[0].key);
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

    /** Which direction's arrow icon is currently highlighted as active, if any. */
    function activeSortDirection(button) {
        const active = button.find(".sort-arrow-active");
        if (!active.exists()) return null;
        return active.text().trim() === "▲" ? "asc" : "desc";
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
        expect(activeSortDirection(sortButton(wrapper, "Name"))).toBe("asc");
        expect(activeSortDirection(sortButton(wrapper, "Weekly downloads"))).toBe(null);

        await sortButton(wrapper, "Name").trigger("click");
        expect(activeSortDirection(sortButton(wrapper, "Name"))).toBe("desc");
    });

    it("switching to a different column resets to ascending", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [pkgC, pkgA, pkgB] },
        });

        await sortButton(wrapper, "Weekly downloads").trigger("click");
        await sortButton(wrapper, "Weekly downloads").trigger("click");
        await sortButton(wrapper, "Name").trigger("click");

        expect(names(wrapper)).toEqual(["aaa", "bbb", "ccc"]);
        expect(activeSortDirection(sortButton(wrapper, "Name"))).toBe("asc");
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

    it("renders no search box of its own - filtering is driven entirely by the searchQuery prop", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue] },
        });

        expect(wrapper.find('input[type="text"]').exists()).toBe(false);
    });

    it("shows every row when searchQuery is omitted", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue] },
        });

        expect(names(wrapper)).toEqual(["react", "react-dom", "vue"]);
    });

    it("filters rows to names containing the query, case-insensitively", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue], searchQuery: "REACT" },
        });

        expect(names(wrapper)).toEqual(["react", "react-dom"]);
    });

    it("matches a substring anywhere in the name, not just a prefix", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue], searchQuery: "dom" },
        });

        expect(names(wrapper)).toEqual(["react-dom"]);
    });

    it("shows no rows when nothing matches", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue], searchQuery: "no-such-package" },
        });

        expect(wrapper.findAll("tbody tr")).toHaveLength(0);
    });

    it("treats a whitespace-only query as empty", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue], searchQuery: "   " },
        });

        expect(names(wrapper)).toEqual(["react", "react-dom", "vue"]);
    });

    it("re-filters reactively when the searchQuery prop changes", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue], searchQuery: "" },
        });

        await wrapper.setProps({ searchQuery: "dom" });

        expect(names(wrapper)).toEqual(["react-dom"]);
    });

    it("applies sorting on top of the filtered results", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [reactDom, react], searchQuery: "react" },
        });

        await wrapper
            .findAll("th button")
            .find((b) => b.text().startsWith("Name"))!
            .trigger("click");

        expect(names(wrapper)).toEqual(["react", "react-dom"]);
    });
});
