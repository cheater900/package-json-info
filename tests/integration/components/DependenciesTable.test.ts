import { describe, it, expect } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import draggable from "vuedraggable";
import DependenciesTable from "../../../src/components/DependenciesTable.vue";
import Tooltip from "../../../src/components/Tooltip.vue";
import { TOGGLEABLE_COLUMNS } from "../../../src/utils/tableColumns";

/** Every toggleable column key except the given ones - i.e. "everything visible except these". */
function columnsExcept(...excluded) {
    return TOGGLEABLE_COLUMNS.map((c) => c.key).filter((key) => !excluded.includes(key));
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
        expect(text).toContain("4,242");
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

        // name/version are always present; every other cell should fall back
        // to '-', except License (marks a missing license with a warning).
        cells.forEach((cell, index) => {
            if (index === 0 || index === 1) return;
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

    it("renders a 'No dependencies' message and no rows for an empty dependency list", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [] },
        });

        expect(wrapper.findAll("tbody tr:not(.status-row)")).toHaveLength(0);
        expect(wrapper.find(".status-row").text()).toBe("No dependencies");
    });

    it("renders a 'Loading…' status row instead of dependency rows while isLoading is true", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [], isLoading: true },
        });

        expect(wrapper.findAll("tbody tr:not(.status-row)")).toHaveLength(0);
        expect(wrapper.find(".status-row").text()).toBe("Loading…");
    });

    it("spans the status row across every currently-visible column", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [], columns: ["version", "license"] },
        });

        const headerCount = wrapper.findAll("thead th").length;
        expect(wrapper.find(".status-row td").attributes("colspan")).toBe(String(headerCount));
    });
});

describe("DependenciesTable load-as-input action", () => {
    it("renders a right arrow in the Name cell as the load affordance", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency] },
        });

        const nameCell = wrapper.find("tbody td");
        expect(nameCell.find(".name-arrow").text()).toBe("→");
    });

    it("emits load-package with the row's name and version when the Name cell is clicked", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency] },
        });

        await wrapper.find("tbody td").trigger("click");

        expect(wrapper.emitted("load-package")).toEqual([[{ name: "left-pad", version: "1.2.0" }]]);
    });
});

describe("DependenciesTable row selection", () => {
    it("emits select-package with the row's dependency when a plain data cell is clicked", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columns: ["version"] },
        });

        await wrapper.findAll("tbody td").at(-1)!.trigger("click");

        expect(wrapper.emitted("select-package")).toEqual([[fullDependency]]);
    });

    it("clicking the Name cell only emits load-package, not select-package", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency] },
        });

        await wrapper.find("tbody td").trigger("click");

        expect(wrapper.emitted("load-package")).toBeTruthy();
        expect(wrapper.emitted("select-package")).toBeFalsy();
    });

    it("clicking the source-code link only follows the link, not select-package", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columns: ["sourceCode"] },
        });

        await wrapper.find("tbody a").trigger("click");

        expect(wrapper.emitted("select-package")).toBeFalsy();
    });

    it("clicking the View tree button only emits open-source-tree, not select-package", async () => {
        const npmSourceTree = {
            provider: "npm",
            tarballUrl: "https://registry.npmjs.org/left-pad/-/left-pad-1.2.0.tgz",
        };
        const wrapper = mount(DependenciesTable, {
            props: {
                dependencies: [{ ...fullDependency, sourceTree: npmSourceTree }],
                columns: ["sourceCodeTree"],
            },
        });

        await wrapper.find("tbody button").trigger("click");

        expect(wrapper.emitted("open-source-tree")).toBeTruthy();
        expect(wrapper.emitted("select-package")).toBeFalsy();
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

    it("hides a column not named in columns, from both the header and every row", () => {
        const wrapper = mount(DependenciesTable, {
            props: {
                dependencies: [fullDependency, sparseDependency],
                columns: columnsExcept("license"),
            },
        });

        const headerTexts = wrapper.findAll("thead th").map((th) => th.text());
        expect(headerTexts).toContain("Maintainers");
        expect(headerTexts.some((t) => t.startsWith("License"))).toBe(false);
        expect(wrapper.text()).not.toContain("MIT");
    });

    it("never hides the Name column even if asked to", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columns: [] },
        });

        const headerTexts = wrapper.findAll("thead th").map((th) => th.text());
        expect(headerTexts.some((t) => t.startsWith("Name"))).toBe(true);
        expect(wrapper.find("tbody td .name-text").text()).toBe("left-pad");
    });

    it("keeps header and row cell counts in sync when columns are hidden", () => {
        const wrapper = mount(DependenciesTable, {
            props: {
                dependencies: [fullDependency],
                columns: columnsExcept("license", "maintainers", "sourceCode"),
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

    it("renders visible columns in the given columns order", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columns: reversedOrder },
        });

        const expectedLabels = [
            "Name",
            ...reversedOrder.map((key) => TOGGLEABLE_COLUMNS.find((c) => c.key === key).label),
        ];
        expect(headerLabels(wrapper)).toEqual(expectedLabels);
    });

    it("falls back to declaration order when columns is omitted", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency] },
        });

        const expectedLabels = ["Name", ...TOGGLEABLE_COLUMNS.map((c) => c.label)];
        expect(headerLabels(wrapper)).toEqual(expectedLabels);
    });

    it("keeps Name first regardless of columns content", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columns: reversedOrder },
        });

        const labels = headerLabels(wrapper);
        expect(labels[0]).toBe("Name");
    });

    it("keeps body <td> order in sync with header <th> order for a non-default columns order", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columns: reversedOrder },
        });

        // sourceCode's cell renders a link, not text - use its position to
        // cross-check header vs body order instead of comparing raw text.
        const sourceCodeIndex = headerLabels(wrapper).indexOf("Source Code link");
        const cells = wrapper.findAll("tbody td");
        expect(cells[sourceCodeIndex].find("a").exists()).toBe(true);
    });

    it("emits reorder-columns with the new column order when the draggable list is reordered", async () => {
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

describe("DependenciesTable column labels", () => {
    function headerLabels(wrapper) {
        return wrapper.findAll("thead th").map((th) =>
            th
                .text()
                .replace(/[\s▲▼]+$/, "")
                .trim(),
        );
    }

    it("renders each column's own full label when shrinkLabels is omitted", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency] },
        });

        expect(headerLabels(wrapper)).toContain("Version Date");
        expect(headerLabels(wrapper)).toContain("Latest release date");
    });

    it("abbreviates every multi-word label to initials when shrinkLabels is true", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], shrinkLabels: true },
        });

        const labels = headerLabels(wrapper);
        expect(labels).toContain("VD"); // Version Date
        expect(labels).toContain("LRD"); // Latest release date
        expect(labels).not.toContain("Version Date");
        expect(labels).not.toContain("Latest release date");
    });

    it("leaves a single-word label unabbreviated even when shrinkLabels is true", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], shrinkLabels: true },
        });

        expect(headerLabels(wrapper)).toContain("Deprecated");
    });

    it("sets a tooltip only for labels that were actually abbreviated", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], shrinkLabels: true },
        });

        const tooltipFor = (labelText) =>
            wrapper
                .findAllComponents(Tooltip)
                .find(
                    (t) =>
                        t.find(".col-label").exists() && t.find(".col-label").text() === labelText,
                )!;

        expect(tooltipFor("VD").props("text")).toBe("Version Date");
        expect(tooltipFor("Deprecated").props("text")).toBe("");
    });
});

describe("DependenciesTable sorting", () => {
    const pkgA = { ...sparseDependency, name: "aaa", weeklyDownloads: 100, gitStars: 5 };
    const pkgB = { ...sparseDependency, name: "bbb", weeklyDownloads: 300, gitStars: null };
    const pkgC = { ...sparseDependency, name: "ccc", weeklyDownloads: 200, gitStars: 15 };

    function names(wrapper) {
        return wrapper.findAll("tbody tr td:first-child .name-text").map((td) => td.text());
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
            "Source Code link",
            "Source Code Tree",
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
        return wrapper.findAll("tbody tr td:first-child .name-text").map((td) => td.text());
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

describe("DependenciesTable source tree", () => {
    const npmSourceTree = {
        provider: "npm",
        tarballUrl: "https://registry.npmjs.org/left-pad/-/left-pad-1.2.0.tgz",
    };

    function mountWithSourceTree(dependency) {
        return mount(DependenciesTable, {
            props: { dependencies: [dependency], columns: ["sourceCodeTree"] },
        });
    }

    it("renders a View tree button when the dependency has a source tree available", () => {
        const wrapper = mountWithSourceTree({ ...fullDependency, sourceTree: npmSourceTree });

        expect(wrapper.find("tbody button").text()).toBe("View tree");
    });

    it("renders a dash instead of a button when no source tree is available", () => {
        const wrapper = mountWithSourceTree({ ...sparseDependency, sourceTree: null });

        const cells = wrapper.findAll("tbody td");
        expect(cells[1].text()).toBe("-");
        expect(cells[1].find("button").exists()).toBe(false);
    });

    it("emits open-source-tree with the clicked dependency, leaving modal ownership to the parent", async () => {
        const dependency = { ...fullDependency, sourceTree: npmSourceTree };
        const wrapper = mountWithSourceTree(dependency);

        await wrapper.find("tbody button").trigger("click");

        expect(wrapper.emitted("open-source-tree")).toEqual([[dependency]]);
    });
});
