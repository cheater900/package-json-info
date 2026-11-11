import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PackageSummaryCard from "../../../src/components/PackageSummaryCard.vue";
import { TOGGLEABLE_COLUMNS } from "../../../src/utils/tableColumns";
import { fullDependency, npmSourceTree, sparseDependency } from "../../fixtures/dependencies";

const dependencyWithTree = { ...fullDependency, sourceTree: npmSourceTree };

describe("PackageSummaryCard", () => {
    it("shows dependency name as title", () => {
        const wrapper = mount(PackageSummaryCard, { props: { dependency: dependencyWithTree } });

        expect(wrapper.find(".package-summary__name").text()).toBe("left-pad");
    });

    it("renders label/value row per toggleable column", () => {
        const wrapper = mount(PackageSummaryCard, { props: { dependency: dependencyWithTree } });

        const labels = wrapper.findAll("dt").map((dt) => dt.text());
        expect(labels).toEqual(TOGGLEABLE_COLUMNS.map((c) => c.label));

        const text = wrapper.text();
        expect(text).toContain("4,242"); // weeklyDownloads
        expect(text).toContain("a, b"); // dependencies
        expect(text).toContain("MIT"); // license
        expect(text).toContain("alice, bob"); // maintainers
    });

    it("renders source-code column as link", () => {
        const wrapper = mount(PackageSummaryCard, { props: { dependency: dependencyWithTree } });

        expect(wrapper.find('a[href="https://github.com/left-pad/left-pad"]').text()).toBe("link");
    });

    it("renders dash instead of link without sourceCode", () => {
        const wrapper = mount(PackageSummaryCard, {
            props: { dependency: { ...dependencyWithTree, sourceCode: null } },
        });

        expect(wrapper.find("a").exists()).toBe(false);
    });

    it("emits open-source-tree with dependency on View tree click", async () => {
        const wrapper = mount(PackageSummaryCard, { props: { dependency: dependencyWithTree } });

        await wrapper.find("button").trigger("click");

        expect(wrapper.emitted("open-source-tree")).toEqual([[dependencyWithTree]]);
    });

    it("renders dash instead of button without source tree", () => {
        const wrapper = mount(PackageSummaryCard, {
            props: { dependency: { ...dependencyWithTree, sourceTree: null } },
        });

        expect(wrapper.find("button").exists()).toBe(false);
    });

    it("renders health score with band class", () => {
        const wrapper = mount(PackageSummaryCard, { props: { dependency: dependencyWithTree } });

        const health = wrapper.find(".health-score");
        expect(health.text()).toBe("55 fair");
        expect(health.classes()).toContain("health-score--fair");
    });
});

describe("PackageSummaryCard stale package", () => {
    it("shows cache date note", () => {
        const wrapper = mount(PackageSummaryCard, {
            props: { dependency: { ...fullDependency, staleSince: "2024-03-05T12:00:00.000Z" } },
        });

        expect(wrapper.find(".package-summary__stale").text()).toBe(
            "Cached data from Mar 05 2024; live lookup failed.",
        );
    });

    it("shows no note on live package", () => {
        const wrapper = mount(PackageSummaryCard, { props: { dependency: fullDependency } });

        expect(wrapper.find(".package-summary__stale").exists()).toBe(false);
    });
});

describe("PackageSummaryCard failed package", () => {
    it("shows load error", () => {
        const wrapper = mount(PackageSummaryCard, {
            props: { dependency: { ...sparseDependency, error: "network down" } },
        });

        expect(wrapper.find(".package-summary__error").text()).toContain("network down");
    });
});
