import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import App from "../../src/App.vue";
import DependenciesTable from "../../src/components/DependenciesTable.vue";
import PackageSummaryCard from "../../src/components/PackageSummaryCard.vue";
import { clearPackageInfoCache } from "../../src/api/npmPackage";
import { jsonResponse } from "../helpers/fetchMock";
import { minimalRegistryDoc } from "../fixtures/dependencies";

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
});
