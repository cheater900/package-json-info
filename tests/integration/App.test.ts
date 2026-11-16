import { describe, it, expect, vi, beforeEach, onTestFinished } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import App from "../../src/app/App.vue";
import ColumnVisibilityPanel from "../../src/app/components/ColumnVisibilityPanel.vue";
import DependenciesTable from "../../src/app/components/DependenciesTable.vue";
import ExportDialog from "../../src/app/components/ExportDialog.vue";
import FiltersPanel from "../../src/app/components/FiltersPanel.vue";
import Modal from "../../src/app/components/Modal.vue";
import NetworkLogDialog from "../../src/app/components/NetworkLogDialog.vue";
import PackageSummaryCard from "../../src/app/components/PackageSummaryCard.vue";
import ReportDialog from "../../src/app/components/ReportDialog.vue";
import SourceTreeBrowser from "../../src/app/components/SourceTreeBrowser.vue";
import { clearPackageInfoCache } from "../../src/core/api/npmPackage";
import {
    countFetchCalls,
    jsonResponse,
    stubFetchPending,
    stubFetchWith,
    textResponse,
} from "../helpers/fetchMock";
import { fullDependency, minimalRegistryDoc, npmSourceTree } from "../fixtures/dependencies";
import { githubTreeBody, monorepoRootJson } from "../fixtures/workspaces";
import { NPM_REGISTRY_URL, OSV_QUERY_URL } from "../../src/core/constants";
import {
    networkLogBatch,
    networkLogEntries,
    startNetworkLog,
} from "../../src/app/utils/networkLog";
import { openShareLink, shareSteps } from "../helpers/shareLink";
import { subjectOf } from "../helpers/requests";
import { networkLogEntry } from "../fixtures/networkLog";

const dependencyWithTree = { ...fullDependency, sourceTree: npmSourceTree };

/** Failed registry request whose subject lists `packageName`. */
function failedLogEntry(packageName: string, replay = vi.fn(async () => new Response())) {
    return networkLogEntry({
        url: `${NPM_REGISTRY_URL}/${packageName}`,
        state: "failure",
        status: null,
        sizeBytes: null,
        error: "Failed to fetch",
        subject: subjectOf([packageName], []),
        replay,
    });
}

beforeEach(() => {
    stubFetchWith(() => jsonResponse(minimalRegistryDoc));
    clearPackageInfoCache();
    // Column toggles persist; the next mount must start from default columns.
    localStorage.clear();
    document.body.innerHTML = "";
    // A loaded source leaves share steps in the address bar; the next mount would replay them.
    window.history.replaceState(null, "", "/");
    networkLogEntries.splice(0);
    networkLogBatch.splice(0);
});

async function mountApp() {
    const wrapper = mount(App, { attachTo: document.body });
    await flushPromises();
    return wrapper;
}

async function openNetworkLog(wrapper: Awaited<ReturnType<typeof mountApp>>) {
    await wrapper.find(".settings-menu__gear").trigger("click");
    await wrapper.find(".settings-menu__logs").trigger("click");
}

/** Package name in the "Showing dependencies for" line. */
function shownPackageName(wrapper: Awaited<ReturnType<typeof mountApp>>) {
    return wrapper.find(".package-name .inline-pre").text();
}

/** Clicks Generate report, waits for its lookups, returns the report dialog. */
async function generateReport(wrapper: Awaited<ReturnType<typeof mountApp>>) {
    await wrapper.find("button.table-actions__report").trigger("click");
    await flushPromises();
    return wrapper.findComponent(ReportDialog);
}

function modalTitle(): string | null | undefined {
    return document.body.querySelector(".modal__title")?.textContent;
}

describe("App", () => {
    it("renders Deps and Dev Deps tables", async () => {
        const wrapper = await mountApp();

        const summaries = wrapper.findAll("details.accordion summary").map((s) => s.text());
        expect(summaries).toEqual([
            "Columns",
            "Deps",
            "Dev Deps",
            "package.json of package-json-info",
        ]);
        expect(wrapper.findAllComponents(DependenciesTable)).toHaveLength(2);
        expect(wrapper.find(".package-name").text()).toBe(
            "Showing dependencies for package-json-info:",
        );
    });

    it("expand button opens table modal, close removes modal", async () => {
        const wrapper = await mountApp();

        await wrapper.findAll(".table-actions__expand")[1].trigger("click");

        expect(document.body.querySelector(".modal .table-modal-content")).not.toBeNull();
        expect(modalTitle()).toBe("Dev Deps of package-json-info");
        expect(wrapper.findAllComponents(DependenciesTable)).toHaveLength(3);
        await wrapper.findComponent(Modal).vm.$emit("close");
        expect(document.body.querySelector(".modal")).toBeNull();
    });

    it("select-package from table opens summary card", async () => {
        const wrapper = await mountApp();
        const dependency = { name: "left-pad", version: "1.0.0", sourceTree: null };

        wrapper.findAllComponents(DependenciesTable)[0].vm.$emit("select-package", dependency);
        await flushPromises();

        expect(wrapper.findComponent(PackageSummaryCard).props("dependency")).toEqual(dependency);
        expect(modalTitle()).toBe("left-pad");
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
        expect(modalTitle()).toBe("Source of left-pad");
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

    it("Export button opens dialog with package name, its table checked and visible columns", async () => {
        const wrapper = await mountApp();

        await wrapper.find("button.table-actions__export").trigger("click");

        const dialog = wrapper.findComponent(ExportDialog);
        expect(dialog.props("title")).toBe("package-json-info");
        expect(modalTitle()).toBe("Export dependencies");
        expect(dialog.props("tables").map((table: { id: string }) => table.id)).toEqual([
            "deps",
            "devDeps",
        ]);
        expect(dialog.props("initialTableIds")).toEqual(["deps"]);
        expect(dialog.props("initialColumns")).toContain("version");
        expect(dialog.props("initialColumns")).not.toContain("vulnerabilityCount");
        dialog.vm.$emit("close");
        await flushPromises();
        expect(document.body.querySelector(".modal")).toBeNull();
    });

    it("Dev Deps Export button opens dialog with only Dev Deps checked", async () => {
        const wrapper = await mountApp();

        await wrapper.findAll("button.table-actions__export")[1].trigger("click");

        expect(wrapper.findComponent(ExportDialog).props("initialTableIds")).toEqual(["devDeps"]);
    });

    it("disables Export while shown column loads", async () => {
        const wrapper = await mountApp();
        const button = wrapper.find("button.table-actions__export");
        expect(button.attributes("disabled")).toBeUndefined();
        stubFetchPending();

        wrapper
            .findComponent(ColumnVisibilityPanel)
            .vm.$emit("toggle-column", "vulnerabilityCount");
        await flushPromises();

        expect(button.attributes("disabled")).toBeDefined();
    });

    it("Filters button toggles in-page panel + aria-expanded", async () => {
        const wrapper = await mountApp();
        const trigger = wrapper.find(".search-row button[aria-controls]");
        const panel = wrapper.findComponent(FiltersPanel);
        expect(panel.isVisible()).toBe(false);

        await trigger.trigger("click");

        expect(panel.isVisible()).toBe(true);
        expect(trigger.attributes("aria-expanded")).toBe("true");
        expect(trigger.attributes("aria-controls")).toBe(panel.attributes("id"));
        document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        expect(panel.isVisible()).toBe(true);
        await trigger.trigger("click");
        expect(panel.isVisible()).toBe(false);
    });

    it("opening Filters scrolls panel above view under search row", async () => {
        const wrapper = await mountApp();
        const scrollBy = vi.fn();
        vi.stubGlobal("scrollBy", scrollBy);
        const rectWith = (rect: Partial<DOMRect>) => () => rect as DOMRect;
        wrapper.find(".search-row").element.getBoundingClientRect = rectWith({ bottom: 60 });
        const panel = wrapper.findComponent(FiltersPanel).element;
        panel.getBoundingClientRect = rectWith({ top: -500 });
        const trigger = wrapper.find(".search-row button[aria-controls]");

        await trigger.trigger("click");
        await flushPromises();

        expect(scrollBy).toHaveBeenCalledWith({ top: -560 });
    });

    it("opening Filters skips scroll when panel in view", async () => {
        const wrapper = await mountApp();
        const scrollBy = vi.fn();
        vi.stubGlobal("scrollBy", scrollBy);
        const rectWith = (rect: Partial<DOMRect>) => () => rect as DOMRect;
        wrapper.find(".search-row").element.getBoundingClientRect = rectWith({ bottom: 300 });
        wrapper.findComponent(FiltersPanel).element.getBoundingClientRect = rectWith({ top: 316 });

        await wrapper.find(".search-row button[aria-controls]").trigger("click");
        await flushPromises();

        expect(scrollBy).not.toHaveBeenCalled();
    });

    it("Filters badge shows active count only when active", async () => {
        const wrapper = await mountApp();
        expect(wrapper.find(".search-row__badge").exists()).toBe(false);

        wrapper
            .findComponent(FiltersPanel)
            .vm.$emit("update:modelValue", { license: "missing", source: "noRepository" });
        await flushPromises();

        const badge = wrapper.find(".search-row__badge");
        expect(badge.find('[aria-hidden="true"]').text()).toBe("2");
        expect(badge.find(".visually-hidden").text()).toBe("2 active");
    });

    it("filter preset on hidden column shows + fetches column", async () => {
        const wrapper = await mountApp();
        stubFetchPending();

        wrapper
            .findComponent(FiltersPanel)
            .vm.$emit("update:modelValue", { vulnerabilities: "any" });
        await flushPromises();

        const tables = wrapper.findAllComponents(DependenciesTable);
        expect(tables[0].props("columns")).toContain("vulnerabilityCount");
        expect(tables[0].props("pendingColumns")).toEqual(new Set(["vulnerabilityCount"]));
        expect(wrapper.findComponent(FiltersPanel).props("modelValue")).toEqual({
            vulnerabilities: "any",
        });
    });

    it("hiding filtered column drops its filter", async () => {
        const wrapper = await mountApp();
        const filtersPanel = wrapper.findComponent(FiltersPanel);
        filtersPanel.vm.$emit("update:modelValue", { vulnerabilities: "any", license: "missing" });
        await flushPromises();

        wrapper
            .findComponent(ColumnVisibilityPanel)
            .vm.$emit("toggle-column", "vulnerabilityCount");
        await flushPromises();

        expect(filtersPanel.props("modelValue")).toEqual({ license: "missing" });
    });

    it("passes filters + own list id to each table", async () => {
        const wrapper = await mountApp();

        wrapper.findComponent(FiltersPanel).vm.$emit("update:modelValue", { license: "missing" });
        await flushPromises();

        const tables = wrapper.findAllComponents(DependenciesTable);
        expect(tables.map((table) => table.props("healthFilters"))).toEqual([
            { license: "missing" },
            { license: "missing" },
        ]);
        expect(tables.map((table) => table.props("listId"))).toEqual(["deps", "devDeps"]);
    });

    it("passes filters + own list id to expanded table", async () => {
        const wrapper = await mountApp();
        wrapper.findComponent(FiltersPanel).vm.$emit("update:modelValue", { license: "missing" });

        await wrapper.findAll(".table-actions__expand")[1].trigger("click");

        const expanded = wrapper.findAllComponents(DependenciesTable)[2];
        expect(expanded.props("healthFilters")).toEqual({ license: "missing" });
        expect(expanded.props("listId")).toBe("devDeps");
    });

    it("Generate report shows loading, then report of shown rows", async () => {
        const wrapper = await mountApp();
        const button = wrapper.find("button.table-actions__report");
        expect(button.text()).toBe("Generate report");

        await button.trigger("click");
        expect(button.text()).toBe("Loading…");
        expect(button.attributes("disabled")).toBeDefined();
        await flushPromises();

        expect(button.text()).toBe("Generate report");
        expect(modalTitle()).toBe("Dependency report");
        const report = wrapper.findComponent(ReportDialog);
        expect(report.props("fileBaseName")).toBe("package-json-info-report");
        expect(report.find("h2").text()).toBe("Dependency report: package-json-info");
    });

    it("report states search query", async () => {
        const wrapper = await mountApp();
        await wrapper.find(".search-row input").setValue("vue");

        const report = await generateReport(wrapper);

        expect(report.text()).toContain('Name search: "vue"');
    });

    it("report states active filters", async () => {
        const wrapper = await mountApp();
        wrapper.findComponent(FiltersPanel).vm.$emit("update:modelValue", { license: "missing" });
        await flushPromises();

        const report = await generateReport(wrapper);

        expect(report.text()).toContain("Active filters: License: Missing");
    });

    it("report fetches columns hidden in tables", async () => {
        const wrapper = await mountApp();
        expect(countFetchCalls(vi.mocked(fetch), OSV_QUERY_URL)).toBe(0);

        await generateReport(wrapper);

        expect(countFetchCalls(vi.mocked(fetch), OSV_QUERY_URL)).toBeGreaterThan(0);
    });

    it("drops report when package.json changes during load", async () => {
        const wrapper = await mountApp();
        const loadedFetch = vi.mocked(fetch).getMockImplementation()!;
        const osvAnswers: ((response: unknown) => void)[] = [];
        vi.mocked(fetch).mockImplementation((url, init) => {
            if (String(url) === OSV_QUERY_URL) {
                return new Promise((resolve) => {
                    osvAnswers.push(resolve as (response: unknown) => void);
                });
            }
            if (String(url) === "https://example.test/package.json") {
                return Promise.resolve(textResponse('{"name":"other"}') as unknown as Response);
            }
            return loadedFetch(url, init);
        });
        const button = wrapper.find("button.table-actions__report");
        await button.trigger("click");
        await flushPromises();

        await wrapper.find("#url-input").setValue("https://example.test/package.json");
        await wrapper.find("form.input-methods__url-form").trigger("submit");
        await flushPromises();
        osvAnswers.forEach((answer) => answer(jsonResponse({})));
        await flushPromises();

        expect(shownPackageName(wrapper)).toBe("other");
        expect(wrapper.findComponent(ReportDialog).exists()).toBe(false);
        expect(button.text()).toBe("Generate report");
    });

    it("disables Generate report while tables load", async () => {
        stubFetchPending();

        const wrapper = await mountApp();

        expect(wrapper.find("button.table-actions__report").attributes("disabled")).toBeDefined();
    });

    it("disables Export while tables load", async () => {
        stubFetchPending();

        const wrapper = await mountApp();

        expect(wrapper.find("button.table-actions__export").attributes("disabled")).toBeDefined();
    });

    it("dialog column fetch leaves tables unchanged", async () => {
        const wrapper = await mountApp();
        const tables = wrapper.findAllComponents(DependenciesTable);
        const rowsBefore = tables.map((table) => table.props("dependencies"));
        await wrapper.find("button.table-actions__export").trigger("click");
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

    it("names export + package.json accordion plain package.json for package without name", async () => {
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
        await wrapper.find("button.table-actions__export").trigger("click");

        expect(wrapper.findComponent(ExportDialog).props("title")).toBe("package.json");
        expect(wrapper.findAll("details.accordion summary").at(-1)!.text()).toBe("package.json");
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

        it("network log retry refetches failed row of entry package", async () => {
            const recover = stubZodRegistryDown();
            const wrapper = await mountApp();
            recover();
            const entry = failedLogEntry("zod");
            networkLogEntries.push(entry);
            await openNetworkLog(wrapper);
            const zodFetchesBefore = countFetchCalls(vi.mocked(fetch), `${NPM_REGISTRY_URL}/zod`);

            wrapper.findComponent(NetworkLogDialog).vm.$emit("retry", entry);
            await flushPromises();

            expect(countFetchCalls(vi.mocked(fetch), `${NPM_REGISTRY_URL}/zod`)).toBeGreaterThan(
                zodFetchesBefore,
            );
            expect(zodRow(wrapper)).toMatchObject({ name: "zod", latestVersion: "1.0.0" });
            expect(entry.replay).not.toHaveBeenCalled();
        });

        it("network log retry button on real failed request refetches row", async () => {
            onTestFinished(startNetworkLog());
            const recover = stubZodRegistryDown();
            const wrapper = await mountApp();
            recover();
            await openNetworkLog(wrapper);

            const retryButton = document.body.querySelector<HTMLButtonElement>(
                `[aria-label="Retry ${NPM_REGISTRY_URL}/zod"]`,
            );
            retryButton?.click();
            await flushPromises();

            expect(retryButton).not.toBeNull();
            expect(zodRow(wrapper)).toMatchObject({ name: "zod", latestVersion: "1.0.0" });
            const zodEntries = networkLogEntries.filter(
                (entry) => entry.url === `${NPM_REGISTRY_URL}/zod`,
            );
            expect(zodEntries.map((entry) => entry.state)).toEqual(["failure", "success"]);
        });

        it("network log retry replays entry without failed row", async () => {
            const wrapper = await mountApp();
            const entry = failedLogEntry("zod");
            networkLogEntries.push(entry);
            await openNetworkLog(wrapper);

            wrapper.findComponent(NetworkLogDialog).vm.$emit("retry", entry);
            await flushPromises();

            expect(entry.replay).toHaveBeenCalledOnce();
        });
    });

    it("settings menu opens network log dialog", async () => {
        const wrapper = await mountApp();

        await openNetworkLog(wrapper);

        expect(wrapper.findComponent(NetworkLogDialog).exists()).toBe(true);
        expect(document.body.querySelector(".modal .network-log")).not.toBeNull();
        expect(modalTitle()).toBe("Network logs");
    });

    it("network badge click opens network log dialog", async () => {
        networkLogBatch.push(networkLogEntry());
        const wrapper = await mountApp();

        await wrapper.find(".network-badge__open").trigger("click");

        expect(wrapper.findComponent(NetworkLogDialog).exists()).toBe(true);
        expect(modalTitle()).toBe("Network logs");
    });

    it("shows error banner for URL without scheme, keeps loaded package", async () => {
        const wrapper = await mountApp();
        const loadedName = shownPackageName(wrapper);

        await wrapper.find("#url-input").setValue("example.com/package.json");
        await wrapper.find("form.input-methods__url-form").trigger("submit");

        expect(wrapper.find(".banner--error").text()).toBe(
            "Enter a full URL starting with http:// or https://.",
        );
        expect(shownPackageName(wrapper)).toBe(loadedName);
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
            expect(shownPackageName(wrapper)).toBe("pkg-a");
            const reloaded = wrapper.find(".workspace-picker select");
            expect((reloaded.element as HTMLSelectElement).value).toBe("packages/a");
        });

        it("shows notice, keeps root table for failed workspace listing", async () => {
            stubMonorepo(jsonResponse(null, false));
            const wrapper = await mountApp();

            await loadMonorepo(wrapper);

            expect(shownPackageName(wrapper)).toBe("mono-root");
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
            expect(shownPackageName(wrapper)).toBe("mono-root");
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
            expect(shownPackageName(wrapper)).toBe("pkg-slow");
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

                expect(shownPackageName(wrapper)).toBe("left-pad");
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
                expect(shownPackageName(wrapper)).toBe("mono-root");
                expect(wrapper.find(".history-controls span").text()).toBe("2 / 2");
                expect(shareSteps()).toEqual([STEP_URL]);
            });

            it("stops replay at workspace missing from repo list", async () => {
                stubMonorepoWithLeftPad(["packages/b"]);
                openShareLink([STEP_URL, "ws:packages/a", STEP_DEPENDENCY]);

                const wrapper = await mountApp();

                expect(shownPackageName(wrapper)).toBe("mono-root");
                expect(wrapper.find(".history-controls span").text()).toBe("2 / 2");
            });

            it("drill-down adds dep step to link, Back removes it", async () => {
                stubMonorepoWithLeftPad([]);
                const wrapper = await mountApp();

                wrapper
                    .findAllComponents(DependenciesTable)[0]
                    .vm.$emit("load-package", { name: "left-pad", version: "^1.0.0" });
                await flushPromises();

                expect(shownPackageName(wrapper)).toBe("left-pad");
                expect(shareSteps()).toEqual([STEP_DEPENDENCY]);
                await wrapper.find(".history-controls button").trigger("click");
                expect(shareSteps()).toEqual([]);
            });
        });
    });
});
