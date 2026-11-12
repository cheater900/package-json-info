import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import App from "../../src/App.vue";
import ColumnVisibilityPanel from "../../src/components/ColumnVisibilityPanel.vue";
import DependenciesTable from "../../src/components/DependenciesTable.vue";
import ExportDialog from "../../src/components/ExportDialog.vue";
import PackageSummaryCard from "../../src/components/PackageSummaryCard.vue";
import SourceTreeBrowser from "../../src/components/SourceTreeBrowser.vue";
import { clearPackageInfoCache } from "../../src/api/npmPackage";
import { jsonResponse, stubFetchPending, textResponse } from "../helpers/fetchMock";
import { fullDependency, minimalRegistryDoc, npmSourceTree } from "../fixtures/dependencies";
import { githubTreeBody, monorepoRootJson } from "../fixtures/workspaces";
import { NPM_REGISTRY_URL } from "../../src/constants";
import { openShareLink, shareSteps } from "../helpers/shareLink";

const dependencyWithTree = { ...fullDependency, sourceTree: npmSourceTree };

beforeEach(() => {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(minimalRegistryDoc)),
    );
    clearPackageInfoCache();
    // Column toggles persist; the next mount must start from default columns.
    localStorage.clear();
    document.body.innerHTML = "";
    // A loaded source leaves share steps in the address bar; the next mount would replay them.
    window.history.replaceState(null, "", "/");
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

        await wrapper.findAll(".table-actions__expand")[1].trigger("click");

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

    it("Export button opens dialog with package name, tables and visible columns", async () => {
        const wrapper = await mountApp();

        await wrapper.find("button.table-export").trigger("click");

        const dialog = wrapper.findComponent(ExportDialog);
        expect(dialog.props("title")).toBe("package-json-info");
        expect(dialog.props("tables").map((table: { id: string }) => table.id)).toEqual([
            "deps",
            "devDeps",
        ]);
        expect(dialog.props("initialColumns")).toContain("version");
        expect(dialog.props("initialColumns")).not.toContain("vulnerabilityCount");
        dialog.vm.$emit("close");
        await flushPromises();
        expect(document.body.querySelector(".modal")).toBeNull();
    });

    it("disables Export while shown column loads", async () => {
        const wrapper = await mountApp();
        const button = wrapper.find("button.table-export");
        expect(button.attributes("disabled")).toBeUndefined();
        stubFetchPending();

        wrapper
            .findComponent(ColumnVisibilityPanel)
            .vm.$emit("toggle-column", "vulnerabilityCount");
        await flushPromises();

        expect(button.attributes("disabled")).toBeDefined();
    });

    it("disables Export while tables load", async () => {
        stubFetchPending();

        const wrapper = await mountApp();

        expect(wrapper.find("button.table-export").attributes("disabled")).toBeDefined();
    });

    it("dialog column fetch leaves tables unchanged", async () => {
        const wrapper = await mountApp();
        const tables = wrapper.findAllComponents(DependenciesTable);
        const rowsBefore = tables.map((table) => table.props("dependencies"));
        await wrapper.find("button.table-export").trigger("click");
        stubFetchPending();

        await wrapper
            .findComponent(ExportDialog)
            .find('input[value="vulnerabilityCount"]')
            .setValue(true);
        await flushPromises();

        expect(document.body.querySelector(".export-dialog [role='status']")).not.toBeNull();
        expect(tables[0].props("dependencies")).toBe(rowsBefore[0]);
        expect(tables[1].props("dependencies")).toBe(rowsBefore[1]);
        expect(tables[0].props("pendingColumns")).toEqual(new Set());
        expect(tables[0].props("isLoading")).toBe(false);
    });

    it("names export after package.json for package without name", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) =>
                url === "https://example.test/package.json"
                    ? textResponse('{"dependencies":{"left-pad":"1.0.0"}}')
                    : jsonResponse(minimalRegistryDoc),
            ),
        );
        const wrapper = await mountApp();

        await wrapper.find("#url-input").setValue("https://example.test/package.json");
        await wrapper.find("form.input-methods__url-form").trigger("submit");
        await flushPromises();
        await wrapper.find("button.table-export").trigger("click");

        expect(wrapper.findComponent(ExportDialog).props("title")).toBe("package.json");
    });

    describe("retry", () => {
        /** Registry answers every package but zod until `recover` runs. */
        function stubZodRegistryDown() {
            let isZodDown = true;
            vi.stubGlobal(
                "fetch",
                vi.fn(async (url: string) => {
                    if (isZodDown && url === `${NPM_REGISTRY_URL}/zod`) {
                        throw new TypeError("Failed to fetch");
                    }
                    return jsonResponse(minimalRegistryDoc);
                }),
            );
            return function recover() {
                isZodDown = false;
            };
        }

        function zodRow(wrapper: Awaited<ReturnType<typeof mountApp>>) {
            return wrapper
                .findAllComponents(DependenciesTable)[0]
                .props("dependencies")
                .find((row: { name: string }) => row.name === "zod");
        }

        it("row reload button refetches that row", async () => {
            const recover = stubZodRegistryDown();
            const wrapper = await mountApp();
            recover();

            await wrapper.find('[aria-label="Retry failed lookups of zod"]').trigger("click");
            await flushPromises();

            expect(zodRow(wrapper)).toMatchObject({ name: "zod", latestVersion: "1.0.0" });
        });

        it("retry failed fetches button replaces failed row, then hides", async () => {
            const recover = stubZodRegistryDown();
            const wrapper = await mountApp();
            expect(zodRow(wrapper)).toMatchObject({ error: "Failed to fetch" });
            recover();

            await wrapper.find(".table-actions__retry").trigger("click");
            await flushPromises();

            expect(zodRow(wrapper)).toMatchObject({ name: "zod", latestVersion: "1.0.0" });
            expect(wrapper.find(".table-actions__retry").exists()).toBe(false);
        });

        it("disables retry failed fetches button while retry runs", async () => {
            stubZodRegistryDown();
            const wrapper = await mountApp();
            stubFetchPending();

            await wrapper.find(".table-actions__retry").trigger("click");

            expect(wrapper.find(".table-actions__retry").attributes("disabled")).toBeDefined();
        });

        it("shows retry failed fetches button only under table with failed row", async () => {
            stubZodRegistryDown();
            const wrapper = await mountApp();

            const buttons = wrapper.findAll(".table-actions__retry");
            expect(buttons).toHaveLength(1);
            expect(buttons[0].text()).toContain("Retry failed fetches");
        });
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

        describe("share link", () => {
            const STEP_URL = "url:https://github.com/o/r";
            const STEP_DEPENDENCY = "dep:left-pad@^1.0.0";

            function stubMonorepoWithLeftPad(dirs: string[]) {
                stubMonorepo(jsonResponse(githubTreeBody(dirs)));
                const monorepoFetch = vi.mocked(fetch).getMockImplementation()!;
                vi.mocked(fetch).mockImplementation(async (url, init) => {
                    if (url !== `${NPM_REGISTRY_URL}/left-pad`) {
                        return monorepoFetch(url, init);
                    }
                    return jsonResponse({
                        "dist-tags": { latest: "1.3.0" },
                        versions: { "1.3.0": { name: "left-pad", version: "1.3.0" } },
                    }) as unknown as Response;
                });
            }

            it("replays url, workspace, dependency steps in order, keeps other params", async () => {
                stubMonorepoWithLeftPad(["packages/a"]);
                openShareLink([STEP_URL, "ws:packages/a", STEP_DEPENDENCY], { keep: "1" });

                const wrapper = await mountApp();

                expect(wrapper.find(".package-name").text()).toBe("left-pad");
                expect(wrapper.find(".history-controls span").text()).toBe("4 / 4");
                expect(wrapper.find(".banner--error").exists()).toBe(false);
                expect((wrapper.find("#url-input").element as HTMLInputElement).value).toBe("");
                expect(shareSteps()).toEqual([STEP_URL, "ws:packages/a", STEP_DEPENDENCY]);
                expect(window.location.search).toContain("keep=1");
            });

            it("stops replay at failed step, shows error banner, trims link", async () => {
                stubMonorepoWithLeftPad(["packages/gone"]);
                openShareLink([STEP_URL, "ws:packages/gone", STEP_DEPENDENCY]);

                const wrapper = await mountApp();

                expect(wrapper.find(".banner--error").text()).toContain("packages/gone");
                expect(wrapper.find(".package-name").text()).toBe("mono-root");
                expect(wrapper.find(".history-controls span").text()).toBe("2 / 2");
                expect(shareSteps()).toEqual([STEP_URL]);
            });

            it("stops replay at workspace missing from repo list", async () => {
                stubMonorepoWithLeftPad(["packages/b"]);
                openShareLink([STEP_URL, "ws:packages/a", STEP_DEPENDENCY]);

                const wrapper = await mountApp();

                expect(wrapper.find(".package-name").text()).toBe("mono-root");
                expect(wrapper.find(".history-controls span").text()).toBe("2 / 2");
            });

            it("drill-down adds dep step to link, Back removes it", async () => {
                stubMonorepoWithLeftPad([]);
                const wrapper = await mountApp();

                wrapper
                    .findAllComponents(DependenciesTable)[0]
                    .vm.$emit("load-package", { name: "left-pad", version: "^1.0.0" });
                await flushPromises();

                expect(wrapper.find(".package-name").text()).toBe("left-pad");
                expect(shareSteps()).toEqual([STEP_DEPENDENCY]);
                await wrapper.find(".history-controls button").trigger("click");
                expect(shareSteps()).toEqual([]);
            });
        });
    });
});
