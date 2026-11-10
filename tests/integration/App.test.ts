import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import App from "../../src/App.vue";
import DependenciesTable from "../../src/components/DependenciesTable.vue";
import PackageSummaryCard from "../../src/components/PackageSummaryCard.vue";
import SourceTreeBrowser from "../../src/components/SourceTreeBrowser.vue";
import { clearPackageInfoCache } from "../../src/api/npmPackage";
import { jsonResponse } from "../helpers/fetchMock";
import { fullDependency, minimalRegistryDoc, npmSourceTree } from "../fixtures/dependencies";

const dependencyWithTree = { ...fullDependency, sourceTree: npmSourceTree };

beforeEach(() => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(minimalRegistryDoc)),
    );
    clearPackageInfoCache();
    document.body.innerHTML = "";
});

async function mountApp() {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    return wrapper;
}

describe("App", () => {
    it("renders Deps and Dev Deps tables", async () => {
        const wrapper = await mountApp();

        const summaries = wrapper.findAll("details.accordion summary").map((s) => s.text());
        expect(summaries).toEqual(["Columns", "Deps", "Dev Deps", "package.json"]);
        expect(wrapper.findAllComponents(DependenciesTable)).toHaveLength(2);
    });

    it("expand button opens table modal, close removes modal", async () => {
        const wrapper = await mountApp();

        await wrapper.findAll(".table-toolbar__expand")[1].trigger("click");

        expect(document.body.querySelector(".modal .table-modal-content")).not.toBeNull();
        expect(wrapper.findAllComponents(DependenciesTable)).toHaveLength(3);
        await wrapper.findComponent({ name: "Modal" }).vm.$emit("close");
        expect(document.body.querySelector(".modal")).toBeNull();
    });

    it("select-package from table opens summary card", async () => {
        const wrapper = await mountApp();
        const dependency = { name: "left-pad", version: "1.0.0", sourceTree: null };

        wrapper.findAllComponents(DependenciesTable)[0].vm.$emit("select-package", dependency);
        await flushPromises();

        expect(wrapper.findComponent(PackageSummaryCard).props("dependency")).toEqual(dependency);
    });

    it("open-source-tree from table opens source tree browser for that dependency", async () => {
        const wrapper = await mountApp();

        wrapper
            .findAllComponents(DependenciesTable)[0]
            .vm.$emit("open-source-tree", dependencyWithTree);
        await flushPromises();

        expect(wrapper.findComponent(SourceTreeBrowser).props()).toEqual({
            dependencyName: "left-pad",
            sourceTree: npmSourceTree,
        });
    });

    it("View tree in summary card swaps card for source tree browser", async () => {
        const wrapper = await mountApp();
        wrapper
            .findAllComponents(DependenciesTable)[0]
            .vm.$emit("select-package", dependencyWithTree);
        await flushPromises();

        wrapper.findComponent(PackageSummaryCard).vm.$emit("open-source-tree", dependencyWithTree);
        await flushPromises();

        expect(wrapper.findComponent(PackageSummaryCard).exists()).toBe(false);
        expect(wrapper.findComponent(SourceTreeBrowser).props("sourceTree")).toEqual(npmSourceTree);
        expect(document.body.querySelectorAll(".modal")).toHaveLength(1);
    });

    it("shows error banner for URL without scheme, keeps loaded package", async () => {
        const wrapper = await mountApp();
        const loadedName = wrapper.find(".package-name").text();

        await wrapper.find("#url-input").setValue("example.com/package.json");
        await wrapper.find("form.input-methods__url-form").trigger("submit");

        expect(wrapper.find(".banner--error").text()).toBe(
            "Enter a full URL starting with http:// or https://.",
        );
        expect(wrapper.find(".package-name").text()).toBe(loadedName);
        expect(wrapper.find(".history-controls").exists()).toBe(false);
    });
});
