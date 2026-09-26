import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PackageSummaryCard from "../../../src/components/PackageSummaryCard.vue";
import { TOGGLEABLE_COLUMNS } from "../../../src/utils/tableColumns";

const npmSourceTree = { provider: "npm", tarballUrl: "https://example.com/left-pad.tgz" };

const fullDependency = {
    name: "left-pad",
    version: "1.2.0",
    versionDate: "2020-01-01T00:00:00.000Z",
    latestVersion: "1.3.0",
    latestReleaseDate: "2021-01-01T00:00:00.000Z",
    latestUpdateDate: "2021-06-01T00:00:00.000Z",
    weeklyDownloads: 4242,
    sourceCode: "https://github.com/left-pad/left-pad",
    sourceTree: npmSourceTree,
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

describe("PackageSummaryCard", () => {
    it("shows the dependency name as its title", () => {
        const wrapper = mount(PackageSummaryCard, { props: { dependency: fullDependency } });

        expect(wrapper.find(".package-summary-name").text()).toBe("left-pad");
    });

    it("renders a label/value row for every toggleable column", () => {
        const wrapper = mount(PackageSummaryCard, { props: { dependency: fullDependency } });

        const labels = wrapper.findAll("dt").map((dt) => dt.text());
        expect(labels).toEqual(TOGGLEABLE_COLUMNS.map((c) => c.label));

        const text = wrapper.text();
        expect(text).toContain("4,242"); // weeklyDownloads
        expect(text).toContain("a, b"); // dependencies
        expect(text).toContain("MIT"); // license
        expect(text).toContain("alice, bob"); // maintainers
    });

    it("renders the source-code column as a link", () => {
        const wrapper = mount(PackageSummaryCard, { props: { dependency: fullDependency } });

        expect(wrapper.find('a[href="https://github.com/left-pad/left-pad"]').text()).toBe("link");
    });

    it("renders a dash instead of a link when sourceCode is missing", () => {
        const wrapper = mount(PackageSummaryCard, {
            props: { dependency: { ...fullDependency, sourceCode: null } },
        });

        expect(wrapper.find("a").exists()).toBe(false);
    });

    it("emits open-source-tree with the dependency when its View tree button is clicked", async () => {
        const wrapper = mount(PackageSummaryCard, { props: { dependency: fullDependency } });

        await wrapper.find("button").trigger("click");

        expect(wrapper.emitted("open-source-tree")).toEqual([[fullDependency]]);
    });

    it("renders a dash instead of a button when no source tree is available", () => {
        const wrapper = mount(PackageSummaryCard, {
            props: { dependency: { ...fullDependency, sourceTree: null } },
        });

        expect(wrapper.find("button").exists()).toBe(false);
    });
});
