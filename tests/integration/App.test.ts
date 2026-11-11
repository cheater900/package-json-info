import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import App from "../../src/App.vue";
import DependenciesTable from "../../src/components/DependenciesTable.vue";
import PackageSummaryCard from "../../src/components/PackageSummaryCard.vue";
import SourceTreeBrowser from "../../src/components/SourceTreeBrowser.vue";
import { clearPackageInfoCache } from "../../src/api/npmPackage";
import { jsonResponse, textResponse } from "../helpers/fetchMock";
import { fullDependency, minimalRegistryDoc, npmSourceTree } from "../fixtures/dependencies";
import { githubTreeBody, monorepoRootJson } from "../fixtures/workspaces";

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

    describe("workspaces", () => {
        const RAW_REPO_URL = "https://raw.githubusercontent.com/o/r/main";

        function stubMonorepo(treeResponse: unknown) {
            vi.stubGlobal(
                "fetch",
                vi.fn(async (url: string) => {
                    if (url === `${RAW_REPO_URL}/package.json`) {
                        return textResponse(monorepoRootJson);
                    }
                    if (url === `${RAW_REPO_URL}/packages/a/package.json`) {
                        return textResponse('{"name":"pkg-a"}');
                    }
                    if (url.includes("/git/trees/")) {
                        return treeResponse;
                    }
                    if (url.startsWith(RAW_REPO_URL)) {
                        return jsonResponse(null, false);
                    }
                    return jsonResponse(minimalRegistryDoc);
                }),
            );
        }

        async function loadMonorepo(wrapper: Awaited<ReturnType<typeof mountApp>>) {
            await wrapper.find("#url-input").setValue("https://github.com/o/r");
            await wrapper.find("form.input-methods__url-form").trigger("submit");
            await flushPromises();
        }

        it("lists workspaces for GitHub monorepo, select loads picked workspace", async () => {
            stubMonorepo(jsonResponse(githubTreeBody(["packages/a", "packages/b"])));
            const wrapper = await mountApp();

            await loadMonorepo(wrapper);

            const select = wrapper.find(".workspace-picker select");
            expect(select.findAll("option").map((option) => option.text())).toEqual([
                "(root)",
                "packages/a",
                "packages/b",
            ]);
            await select.setValue("packages/a");
            await flushPromises();
            expect(wrapper.find(".package-name").text()).toBe("pkg-a");
            const reloaded = wrapper.find(".workspace-picker select");
            expect((reloaded.element as HTMLSelectElement).value).toBe("packages/a");
        });

        it("shows notice, keeps root table for failed workspace listing", async () => {
            stubMonorepo(jsonResponse(null, false));
            const wrapper = await mountApp();

            await loadMonorepo(wrapper);

            expect(wrapper.find(".package-name").text()).toBe("mono-root");
            expect(wrapper.find(".workspace-picker select").exists()).toBe(false);
            expect(wrapper.find(".workspace-picker__note").text()).toContain(
                "Could not check this repository for workspaces",
            );
            expect(wrapper.find(".banner--error").exists()).toBe(false);
        });

        it("puts select back on loaded workspace after failed workspace load", async () => {
            stubMonorepo(jsonResponse(githubTreeBody(["packages/a", "packages/gone"])));
            const wrapper = await mountApp();
            await loadMonorepo(wrapper);
            const select = wrapper.find(".workspace-picker select");

            await select.setValue("packages/gone");
            await flushPromises();

            expect(wrapper.find(".banner--error").text()).toContain("packages/gone");
            expect(wrapper.find(".package-name").text()).toBe("mono-root");
            expect((select.element as HTMLSelectElement).value).toBe("");
            expect((select.element as HTMLSelectElement).disabled).toBe(false);
        });

        it("disables select while workspace loads", async () => {
            stubMonorepo(jsonResponse(githubTreeBody(["packages/slow"])));
            const wrapper = await mountApp();
            await loadMonorepo(wrapper);
            const loadedFetch = vi.mocked(fetch).getMockImplementation()!;
            let answer: (response: unknown) => void;
            vi.mocked(fetch).mockImplementation((url, init) => {
                if (String(url).endsWith("/packages/slow/package.json")) {
                    return new Promise((resolve) => {
                        answer = resolve as (response: unknown) => void;
                    });
                }
                return loadedFetch(url, init);
            });
            const select = wrapper.find(".workspace-picker select");

            await select.setValue("packages/slow");
            await flushPromises();

            expect((select.element as HTMLSelectElement).disabled).toBe(true);
            answer!(textResponse('{"name":"pkg-slow"}'));
            await flushPromises();
            expect(wrapper.find(".package-name").text()).toBe("pkg-slow");
            const reloaded = wrapper.find(".workspace-picker select");
            expect((reloaded.element as HTMLSelectElement).disabled).toBe(false);
        });

        it("shows truncated note beside picker for cut-short tree with matches", async () => {
            stubMonorepo(jsonResponse({ ...githubTreeBody(["packages/a"]), truncated: true }));
            const wrapper = await mountApp();

            await loadMonorepo(wrapper);

            expect(wrapper.find(".workspace-picker select").exists()).toBe(true);
            expect(wrapper.findAll(".workspace-picker__note").map((note) => note.text())).toEqual([
                expect.stringContaining("too large to list"),
            ]);
        });

        it("shows truncated note for cut-short tree without matching workspace", async () => {
            stubMonorepo(jsonResponse({ tree: [], truncated: true }));
            const wrapper = await mountApp();

            await loadMonorepo(wrapper);

            expect(wrapper.find(".workspace-picker select").exists()).toBe(false);
            expect(wrapper.find(".workspace-picker__note").text()).toContain("too large to list");
        });

        it("shows repo URL hint for uploaded package.json with workspaces", async () => {
            const wrapper = await mountApp();
            const input = wrapper.find(".input-methods__file-input");
            Object.defineProperty(input.element, "files", {
                value: [new File([monorepoRootJson], "package.json")],
            });

            await input.trigger("change");
            await flushPromises();

            expect(wrapper.find(".workspace-picker__note").text()).toContain(
                "Load it by GitHub repository URL",
            );
        });

        it("shows no workspace UI for package.json without workspaces", async () => {
            const wrapper = await mountApp();

            expect(wrapper.find(".workspace-picker").exists()).toBe(false);
            expect(wrapper.find(".workspace-picker__note").exists()).toBe(false);
        });
    });
});
