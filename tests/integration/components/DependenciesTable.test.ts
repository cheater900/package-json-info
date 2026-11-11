import { describe, it, expect } from "vitest";
import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import type { DOMWrapper, VueWrapper } from "@vue/test-utils";
import draggable from "vuedraggable";
import DependenciesTable from "../../../src/components/DependenciesTable.vue";
import Tooltip from "../../../src/components/Tooltip.vue";
import { TOGGLEABLE_COLUMNS } from "../../../src/utils/tableColumns";
import type { DependencyRow } from "../../../src/types";
import { columnKeysExcept } from "../../helpers/columns";
import { fullDependency, npmSourceTree, sparseDependency } from "../../fixtures/dependencies";

function headerLabels(wrapper: VueWrapper) {
    return wrapper.findAll("thead th").map((th) =>
        th
            .text()
            .replace(/[\s▲▼]+$/, "")
            .trim(),
    );
}

function rowNames(wrapper: VueWrapper) {
    return wrapper.findAll("tbody tr td:first-child .deps-table__name-text").map((td) => td.text());
}

describe("DependenciesTable", () => {
    it("every header column has matching data cell per row", () => {
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

    it("renders full dependency data row", () => {
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

    it("renders '-' for missing fields, no blank cells", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [sparseDependency] },
        });

        const cells = wrapper.findAll("tbody td");
        const licenseIndex = headerLabels(wrapper).indexOf("License");

        // name/version are always present; every other cell should fall back
        // to '-', except License (marks a missing license with a warning).
        cells.forEach((cell, index) => {
            if (index === 0 || index === 1) {
                return;
            }
            if (index === licenseIndex) {
                expect(cell.text()).toBe("- ⚠");
                return;
            }
            expect(cell.text()).toBe("-");
        });
        expect(wrapper.find("tbody a").exists()).toBe(false);
    });

    it("renders one row per dependency", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency, sparseDependency] },
        });

        expect(wrapper.findAll("tbody tr")).toHaveLength(2);
    });

    it("renders 'No dependencies' and no rows for empty list", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [] },
        });

        expect(wrapper.findAll("tbody tr:not(.deps-table__status-row)")).toHaveLength(0);
        expect(wrapper.find(".deps-table__status-row").text()).toBe("No dependencies");
    });

    it("renders 'Loading…' status row while isLoading true", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [], isLoading: true },
        });

        expect(wrapper.findAll("tbody tr:not(.deps-table__status-row)")).toHaveLength(0);
        expect(wrapper.find(".deps-table__status-row").text()).toBe("Loading…");
    });

    it("spans status row across visible columns", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [], columns: ["version", "license"] },
        });

        const headerCount = wrapper.findAll("thead th").length;
        expect(wrapper.find(".deps-table__status-row td").attributes("colspan")).toBe(
            String(headerCount),
        );
    });

    it("renders health score with band class", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columns: ["healthScore"] },
        });

        const health = wrapper.find("tbody .health-score");
        expect(health.text()).toBe("55 fair");
        expect(health.classes()).toContain("health-score--fair");
    });
});

describe("DependenciesTable load-as-input action", () => {
    it("renders right arrow in Name cell as load affordance", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency] },
        });

        const nameCell = wrapper.find("tbody td");
        expect(nameCell.find(".deps-table__name-arrow").text()).toBe("→");
    });

    it("emits load-package with row name and version on Name cell click", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency] },
        });

        await wrapper.find("tbody td").trigger("click");

        expect(wrapper.emitted("load-package")).toEqual([[{ name: "left-pad", version: "1.2.0" }]]);
    });
});

describe("DependenciesTable row selection", () => {
    it("emits select-package with row dependency on data cell click", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columns: ["version"] },
        });

        await wrapper.findAll("tbody td").at(-1)!.trigger("click");

        expect(wrapper.emitted("select-package")).toEqual([[fullDependency]]);
    });

    it("Name cell click emits load-package only, not select-package", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency] },
        });

        await wrapper.find("tbody td").trigger("click");

        expect(wrapper.emitted("load-package")).toBeTruthy();
        expect(wrapper.emitted("select-package")).toBeFalsy();
    });

    it("source-code link click follows link only, not select-package", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columns: ["sourceCode"] },
        });

        await wrapper.find("tbody a").trigger("click");

        expect(wrapper.emitted("select-package")).toBeFalsy();
    });

    it("View tree click emits open-source-tree only, not select-package", async () => {
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

    it("hides column missing from columns in header and rows", () => {
        const wrapper = mount(DependenciesTable, {
            props: {
                dependencies: [fullDependency, sparseDependency],
                columns: columnKeysExcept("license"),
            },
        });

        const headerTexts = wrapper.findAll("thead th").map((th) => th.text());
        expect(headerTexts).toContain("Maintainers");
        expect(headerTexts.some((t) => t.startsWith("License"))).toBe(false);
        expect(wrapper.text()).not.toContain("MIT");
    });

    it("never hides Name column", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columns: [] },
        });

        const headerTexts = wrapper.findAll("thead th").map((th) => th.text());
        expect(headerTexts.some((t) => t.startsWith("Name"))).toBe(true);
        expect(wrapper.find("tbody td .deps-table__name-text").text()).toBe("left-pad");
    });

    it("keeps header and row cell counts in sync with hidden columns", () => {
        const wrapper = mount(DependenciesTable, {
            props: {
                dependencies: [fullDependency],
                columns: columnKeysExcept("license", "maintainers", "sourceCode"),
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

    it("renders visible columns in columns order", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columns: reversedOrder },
        });

        const expectedLabels = [
            "Name",
            ...reversedOrder.map((key) => TOGGLEABLE_COLUMNS.find((c) => c.key === key)!.label),
        ];
        expect(headerLabels(wrapper)).toEqual(expectedLabels);
    });

    it("falls back to declaration order without columns", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency] },
        });

        const expectedLabels = ["Name", ...TOGGLEABLE_COLUMNS.map((c) => c.label)];
        expect(headerLabels(wrapper)).toEqual(expectedLabels);
    });

    it("keeps Name first for any columns", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columns: reversedOrder },
        });

        const labels = headerLabels(wrapper);
        expect(labels[0]).toBe("Name");
    });

    it("keeps body <td> order in sync with header <th> for custom columns order", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columns: reversedOrder },
        });

        // sourceCode's cell renders a link, not text - use its position to
        // cross-check header vs body order instead of comparing raw text.
        const sourceCodeIndex = headerLabels(wrapper).indexOf("Source Code link");
        const cells = wrapper.findAll("tbody td");
        expect(cells[sourceCodeIndex].find("a").exists()).toBe(true);
    });

    it("emits reorder-columns with new order on drag reorder", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency] },
        });

        const draggableComponent = wrapper.findComponent(draggable);
        const list = draggableComponent.props("list")!;
        [list[0], list[1]] = [list[1], list[0]];
        await nextTick();

        const emitted = wrapper.emitted<[string[]]>("reorder-columns")!;
        expect(emitted).toBeTruthy();
        const [newOrder] = emitted[emitted.length - 1];
        expect(newOrder[0]).toBe(TOGGLEABLE_COLUMNS[1].key);
        expect(newOrder[1]).toBe(TOGGLEABLE_COLUMNS[0].key);
    });
});

describe("DependenciesTable column changes after mount", () => {
    it("drops hidden column from header and rows, emits no reorder", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columns: columnKeysExcept() },
        });

        await wrapper.setProps({ columns: columnKeysExcept("license") });

        expect(headerLabels(wrapper)).not.toContain("License");
        expect(wrapper.findAll("tbody tr td")).toHaveLength(wrapper.findAll("thead th").length);
        expect(wrapper.emitted("reorder-columns")).toBeUndefined();
    });

    it("follows order changed by sibling table", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columns: ["version", "license"] },
        });

        await wrapper.setProps({ columns: ["license", "version"] });

        expect(headerLabels(wrapper)).toEqual(["Name", "License", "Version"]);
        expect(wrapper.emitted("reorder-columns")).toBeUndefined();
    });

    it("ignores unknown column key", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], columns: ["version", "removedColumn"] },
        });

        expect(headerLabels(wrapper)).toEqual(["Name", "Version"]);
        expect(wrapper.findAll("tbody tr td")).toHaveLength(2);
    });
});

describe("DependenciesTable truncated cells", () => {
    const EXPANDED_CLASS = "deps-table__truncate-cell--expanded";
    const OVERFLOWING_CLASS = "deps-table__truncate-cell--overflowing";

    function setCellWidths(cell: Element, scrollWidth: number) {
        Object.defineProperty(cell, "scrollWidth", { value: scrollWidth, configurable: true });
        Object.defineProperty(cell, "clientWidth", { value: 100, configurable: true });
    }

    function mountWithLicenseCell(isClipped: boolean) {
        const wrapper = mount(DependenciesTable, {
            props: {
                dependencies: [fullDependency, { ...sparseDependency, license: "MIT" }],
                columns: ["license", "version"],
            },
        });
        const cells = wrapper.findAll("td.deps-table__truncate-cell");
        // jsdom lays nothing out: both widths read 0 unless set.
        setCellWidths(cells[0].element, isClipped ? 300 : 100);
        return { wrapper, cell: cells[0], otherRowCell: cells[1] };
    }

    it("makes only truncatable columns truncate cells", () => {
        const { wrapper } = mountWithLicenseCell(true);

        expect(wrapper.findAll("td.deps-table__truncate-cell")).toHaveLength(2);
    });

    it("click expands clipped cell only, skips select-package", async () => {
        const { wrapper, cell, otherRowCell } = mountWithLicenseCell(true);

        await cell.trigger("click");

        expect(cell.classes()).toContain(EXPANDED_CLASS);
        expect(otherRowCell.classes()).not.toContain(EXPANDED_CLASS);
        expect(wrapper.emitted("select-package")).toBeUndefined();
    });

    it("second click collapses expanded cell even when text fits again", async () => {
        const { wrapper, cell } = mountWithLicenseCell(true);
        await cell.trigger("click");
        setCellWidths(cell.element, 100);

        await cell.trigger("click");

        expect(cell.classes()).not.toContain(EXPANDED_CLASS);
        expect(wrapper.emitted("select-package")).toBeUndefined();
    });

    it("click on fitting cell selects package, expands nothing", async () => {
        const { wrapper, cell } = mountWithLicenseCell(false);

        await cell.trigger("click");

        expect(cell.classes()).not.toContain(EXPANDED_CLASS);
        expect(wrapper.emitted("select-package")).toEqual([[fullDependency]]);
    });

    it.each([
        [true, true],
        [false, false],
    ])("hover on cell with clipped=%s sets overflowing marker %s", async (isClipped, expected) => {
        const { cell } = mountWithLicenseCell(isClipped);

        await cell.trigger("mouseenter");

        expect(cell.classes().includes(OVERFLOWING_CLASS)).toBe(expected);
    });
});

describe("DependenciesTable column labels", () => {
    it("renders full labels without shrinkLabels", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency] },
        });

        expect(headerLabels(wrapper)).toContain("Version Date");
        expect(headerLabels(wrapper)).toContain("Latest release date");
    });

    it("abbreviates multi-word labels with shrinkLabels true", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], shrinkLabels: true },
        });

        const labels = headerLabels(wrapper);
        expect(labels).toContain("VD"); // Version Date
        expect(labels).toContain("LRD"); // Latest release date
        expect(labels).not.toContain("Version Date");
        expect(labels).not.toContain("Latest release date");
    });

    it("leaves single-word label unabbreviated with shrinkLabels true", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], shrinkLabels: true },
        });

        expect(headerLabels(wrapper)).toContain("Deprecated");
    });

    it("sets tooltip only for abbreviated labels", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency], shrinkLabels: true },
        });

        const tooltipFor = (labelText: string) =>
            wrapper
                .findAllComponents(Tooltip)
                .find(
                    (t) =>
                        t.find(".deps-table__col-label").exists() &&
                        t.find(".deps-table__col-label").text() === labelText,
                )!;

        expect(tooltipFor("VD").props("text")).toBe("Version Date");
        expect(tooltipFor("Deprecated").props("text")).toBe("");
    });
});

describe("DependenciesTable sorting", () => {
    const pkgA = { ...sparseDependency, name: "aaa", weeklyDownloads: 100, gitStars: 5 };
    const pkgB = { ...sparseDependency, name: "bbb", weeklyDownloads: 300, gitStars: null };
    const pkgC = { ...sparseDependency, name: "ccc", weeklyDownloads: 200, gitStars: 15 };

    function sortButton(wrapper: VueWrapper, label: string) {
        const button = wrapper.findAll("th button").find((b) => b.text().startsWith(label));
        if (!button) {
            throw new Error(`No sort button found for column "${label}"`);
        }
        return button;
    }

    /** Which direction's arrow icon is currently highlighted as active, if any. */
    function activeSortDirection(button: DOMWrapper<Element>) {
        const active = button.find(".sort-indicator__arrow--active");
        if (!active.exists()) {
            return null;
        }
        return active.text().trim() === "▲" ? "asc" : "desc";
    }

    it("keeps prop order until header click", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [pkgC, pkgA, pkgB] },
        });

        expect(rowNames(wrapper)).toEqual(["ccc", "aaa", "bbb"]);
    });

    it("sorts ascending on first click, descending on second", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [pkgC, pkgA, pkgB] },
        });

        await sortButton(wrapper, "Weekly downloads").trigger("click");
        expect(rowNames(wrapper)).toEqual(["aaa", "ccc", "bbb"]);

        await sortButton(wrapper, "Weekly downloads").trigger("click");
        expect(rowNames(wrapper)).toEqual(["bbb", "ccc", "aaa"]);
    });

    it("shows sort indicator only on active column", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [pkgC, pkgA, pkgB] },
        });

        await sortButton(wrapper, "Name").trigger("click");
        expect(activeSortDirection(sortButton(wrapper, "Name"))).toBe("asc");
        expect(activeSortDirection(sortButton(wrapper, "Weekly downloads"))).toBe(null);

        await sortButton(wrapper, "Name").trigger("click");
        expect(activeSortDirection(sortButton(wrapper, "Name"))).toBe("desc");
    });

    it("switching column resets to ascending", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [pkgC, pkgA, pkgB] },
        });

        await sortButton(wrapper, "Weekly downloads").trigger("click");
        await sortButton(wrapper, "Weekly downloads").trigger("click");
        await sortButton(wrapper, "Name").trigger("click");

        expect(rowNames(wrapper)).toEqual(["aaa", "bbb", "ccc"]);
        expect(activeSortDirection(sortButton(wrapper, "Name"))).toBe("asc");
    });

    it("sorts missing values last in both directions", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [pkgC, pkgA, pkgB] },
        });

        await sortButton(wrapper, "Git stars").trigger("click");
        expect(rowNames(wrapper)).toEqual(["aaa", "ccc", "bbb"]);

        await sortButton(wrapper, "Git stars").trigger("click");
        expect(rowNames(wrapper)).toEqual(["ccc", "aaa", "bbb"]);
    });

    it("renders no sort button for non-sortable columns", () => {
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

    it("sorts by vulnerability count, unknown last", async () => {
        const withVulns = { ...sparseDependency, name: "aaa", vulnerabilityCount: 3 };
        const withoutVulns = { ...sparseDependency, name: "bbb", vulnerabilityCount: 0 };
        const unknownVulns = { ...sparseDependency, name: "ccc", vulnerabilityCount: null };
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [withVulns, withoutVulns, unknownVulns] },
        });

        await sortButton(wrapper, "Vulnerabilities").trigger("click");

        expect(rowNames(wrapper)).toEqual(["bbb", "aaa", "ccc"]);
    });

    it("sorts by health score, unknown last", async () => {
        const fair = { ...sparseDependency, name: "aaa", healthScore: 55 };
        const unknown = { ...sparseDependency, name: "bbb", healthScore: null };
        const good = { ...sparseDependency, name: "ccc", healthScore: 90 };
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [good, unknown, fair] },
        });

        await sortButton(wrapper, "Health").trigger("click");

        expect(rowNames(wrapper)).toEqual(["aaa", "ccc", "bbb"]);
    });
});

describe("DependenciesTable search", () => {
    const react = { ...sparseDependency, name: "react" };
    const reactDom = { ...sparseDependency, name: "react-dom" };
    const vue = { ...sparseDependency, name: "vue" };

    it("renders no own search box, filters by searchQuery prop", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue] },
        });

        expect(wrapper.find('input[type="text"]').exists()).toBe(false);
    });

    it("shows every row without searchQuery", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue] },
        });

        expect(rowNames(wrapper)).toEqual(["react", "react-dom", "vue"]);
    });

    it("filters rows by name containing query, case-insensitive", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue], searchQuery: "REACT" },
        });

        expect(rowNames(wrapper)).toEqual(["react", "react-dom"]);
    });

    it("matches substring anywhere in name, not only prefix", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue], searchQuery: "dom" },
        });

        expect(rowNames(wrapper)).toEqual(["react-dom"]);
    });

    it("shows no rows without match", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue], searchQuery: "no-such-package" },
        });

        expect(wrapper.findAll("tbody tr")).toHaveLength(0);
    });

    it("treats whitespace-only query as empty", () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue], searchQuery: "   " },
        });

        expect(rowNames(wrapper)).toEqual(["react", "react-dom", "vue"]);
    });

    it("re-filters on searchQuery prop change", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [react, reactDom, vue], searchQuery: "" },
        });

        await wrapper.setProps({ searchQuery: "dom" });

        expect(rowNames(wrapper)).toEqual(["react-dom"]);
    });

    it("sorts filtered results", async () => {
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [reactDom, react], searchQuery: "react" },
        });

        await wrapper
            .findAll("th button")
            .find((b) => b.text().startsWith("Name"))!
            .trigger("click");

        expect(rowNames(wrapper)).toEqual(["react", "react-dom"]);
    });
});

describe("DependenciesTable source tree", () => {
    function mountWithSourceTree(dependency: DependencyRow) {
        return mount(DependenciesTable, {
            props: { dependencies: [dependency], columns: ["sourceCodeTree"] },
        });
    }

    it("renders View tree button with source tree", () => {
        const wrapper = mountWithSourceTree({ ...fullDependency, sourceTree: npmSourceTree });

        expect(wrapper.find("tbody button").text()).toBe("View tree");
    });

    it("renders dash instead of button without source tree", () => {
        const wrapper = mountWithSourceTree({ ...sparseDependency, sourceTree: null });

        const cells = wrapper.findAll("tbody td");
        expect(cells[1].text()).toBe("-");
        expect(cells[1].find("button").exists()).toBe(false);
    });

    it("emits open-source-tree with clicked dependency, parent owns modal", async () => {
        const dependency = { ...fullDependency, sourceTree: npmSourceTree };
        const wrapper = mountWithSourceTree(dependency);

        await wrapper.find("tbody button").trigger("click");

        expect(wrapper.emitted("open-source-tree")).toEqual([[dependency]]);
    });
});

describe("DependenciesTable stale rows", () => {
    it("shows stale badge with cache date tooltip", () => {
        const stale = { ...fullDependency, staleSince: "2024-03-05T12:00:00.000Z" };
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [stale], columns: ["version"] },
        });

        const nameCell = wrapper.find(".deps-table__name-cell");
        expect(nameCell.find(".deps-table__stale-badge").text()).toBe("stale");
        expect(nameCell.findComponent(Tooltip).props("text")).toBe(
            "Cached data from Mar 05 2024; live lookup failed.",
        );
    });

    it("shows no badge on live or failed row", () => {
        const failed = { name: "broken", version: "1.0.0", error: "503" };
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [fullDependency, failed], columns: ["version"] },
        });

        expect(wrapper.find(".deps-table__stale-badge").exists()).toBe(false);
    });
});

describe("DependenciesTable failed rows", () => {
    it("shows row error message instead of dashes", () => {
        const failed = {
            name: "broken",
            version: "1.0.0",
            error: "Request failed with status 503",
        };
        const wrapper = mount(DependenciesTable, {
            props: { dependencies: [failed], columns: ["version", "license"] },
        });

        const errorCell = wrapper.find(".deps-table__error-cell");
        expect(errorCell.text()).toContain("Request failed with status 503");
        expect(errorCell.attributes("colspan")).toBe("2");
    });
});

describe("DependenciesTable retry button", () => {
    const errorRow = { name: "broken", version: "1.0.0", error: "503" };
    const staleRow = { ...fullDependency, name: "stale", staleSince: "2024-03-05T12:00:00.000Z" };
    const failedRow = {
        ...fullDependency,
        name: "failed",
        failedLookups: { weeklyDownloads: "Request failed with status 503" },
    };

    function mountTable(dependencies: DependencyRow[], retryingPackages = new Set<string>()) {
        return mount(DependenciesTable, {
            props: { dependencies, columns: ["weeklyDownloads"], retryingPackages },
        });
    }

    it("shows for error, stale and failed-lookup rows only", () => {
        const wrapper = mountTable([fullDependency, errorRow, staleRow, failedRow]);

        const labels = wrapper
            .findAll(".deps-table__retry")
            .map((button) => button.attributes("aria-label"));
        expect(labels).toEqual([
            "Retry lookups for broken",
            "Retry lookups for stale",
            "Retry lookups for failed",
        ]);
    });

    it("emits retry-package, not load-package or select-package", async () => {
        const wrapper = mountTable([failedRow]);

        await wrapper.find(".deps-table__retry").trigger("click");

        expect(wrapper.emitted("retry-package")).toEqual([[{ name: "failed", version: "1.2.0" }]]);
        expect(wrapper.emitted("load-package")).toBeUndefined();
        expect(wrapper.emitted("select-package")).toBeUndefined();
    });

    it("disables button of retrying row", () => {
        const wrapper = mountTable([errorRow, failedRow], new Set(["broken"]));

        const disabled = wrapper
            .findAll(".deps-table__retry")
            .map((button) => button.attributes("disabled") !== undefined);
        expect(disabled).toEqual([true, false]);
    });

    it("shows '?' in failed column cell", () => {
        const wrapper = mountTable([failedRow]);

        expect(wrapper.find(".dependency-cell--failed").text()).toBe("?");
    });
});
