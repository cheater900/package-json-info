import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { effectScope, ref, nextTick } from "vue";
import type { Ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import { usePackageJsonHistory } from "../../../../src/app/composables/usePackageJsonHistory";
import { clearPackageInfoCache } from "../../../../src/core/api/npmPackage";
import { githubToken, settings } from "../../../../src/app/settings";
import {
    HTTP_STATUS,
    countFetchCalls,
    fetchCallsTo,
    jsonResponse,
    statusResponse,
} from "../../../helpers/fetchMock";
import { resetSettings } from "../../../helpers/settings";
import { GITHUB_API_URL, NPM_REGISTRY_URL } from "../../../../src/core/constants";
import type { PackageInfo } from "../../../../src/core/types";
import { minimalRegistryDoc } from "../../../fixtures/dependencies";
import { rootWorkspaceContext } from "../../../fixtures/workspaces";
import { recordRequests } from "../../../helpers/requests";

/** Every fetch resolves with an empty-ish, valid-shaped response - enough
 * for fetchPackageInfo to complete without needing per-package data. */
function stubFetchResolvesEmpty() {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse(minimalRegistryDoc)),
    );
}

const validPackageJson = JSON.stringify({
    name: "demo",
    dependencies: { "left-pad": "^1.0.0" },
    devDependencies: {},
});

// Watchers on the global token and settings outlive a test unless stopped.
let scope = effectScope();

function useHistory(visibleColumns: Ref<ReadonlySet<string>>) {
    return scope.run(() => usePackageJsonHistory(visibleColumns))!;
}

beforeEach(() => {
    clearPackageInfoCache();
});

afterEach(() => {
    scope.stop();
    scope = effectScope();
    resetSettings();
});

describe("loadPackageJsonText", () => {
    it("records and applies new history entry for valid JSON", () => {
        stubFetchResolvesEmpty();
        const visibleColumns = ref(new Set<string>());
        const { loadPackageJsonText, pkg, history, historyIndex, loadError } =
            useHistory(visibleColumns);

        const result = loadPackageJsonText(validPackageJson);

        expect(result).toBe(true);
        expect(pkg.value).toEqual(JSON.parse(validPackageJson));
        expect(history.value).toHaveLength(1);
        expect(historyIndex.value).toBe(0);
        expect(loadError.value).toBe(null);
    });

    it("sets loadError, keeps state for invalid JSON", () => {
        const visibleColumns = ref(new Set<string>());
        const { loadPackageJsonText, pkg, history, loadError } = useHistory(visibleColumns);

        const result = loadPackageJsonText("{not valid json");

        expect(result).toBe(false);
        expect(pkg.value).toBe(null);
        expect(history.value).toHaveLength(0);
        expect(loadError.value).toContain("not valid JSON");
    });

    it("sets loadError for non-object JSON", () => {
        const visibleColumns = ref(new Set<string>());
        const { loadPackageJsonText, loadError } = useHistory(visibleColumns);

        const result = loadPackageJsonText("[]");

        expect(result).toBe(false);
        expect(loadError.value).toContain("expected a JSON object");
    });

    it("sets loadError, keeps state for non-string dependency version", () => {
        const visibleColumns = ref(new Set<string>());
        const { loadPackageJsonText, pkg, history, loadError } = useHistory(visibleColumns);

        const result = loadPackageJsonText(JSON.stringify({ dependencies: { "left-pad": 1 } }));

        expect(result).toBe(false);
        expect(pkg.value).toBe(null);
        expect(history.value).toHaveLength(0);
        expect(loadError.value).toContain("dependencies.left-pad");
    });

    it("clears previous loadError on successful load", () => {
        stubFetchResolvesEmpty();
        const visibleColumns = ref(new Set<string>());
        const { loadPackageJsonText, loadError } = useHistory(visibleColumns);

        loadPackageJsonText("{not valid json");
        expect(loadError.value).not.toBe(null);

        loadPackageJsonText(validPackageJson);
        expect(loadError.value).toBe(null);
    });

    it("fetches and populates deps for new entry", async () => {
        stubFetchResolvesEmpty();
        const visibleColumns = ref(new Set<string>());
        const { loadPackageJsonText, deps, isLoadingDeps } = useHistory(visibleColumns);

        loadPackageJsonText(validPackageJson);
        expect(isLoadingDeps.value).toBe(true);

        await vi.waitFor(() => expect(isLoadingDeps.value).toBe(false));
        expect(deps.value).toHaveLength(1);
        expect(deps.value[0].name).toBe("left-pad");
    });
});

describe("request subjects", () => {
    it("tags table requests with loaded package.json name", async () => {
        stubFetchResolvesEmpty();
        const recorder = recordRequests();
        const { loadPackageJsonText } = useHistory(ref(new Set(["license"])));

        loadPackageJsonText(validPackageJson);
        await flushPromises();
        recorder.stop();

        const subjects = recorder.requests.map((request) => request.subject);
        expect(subjects.length).toBeGreaterThan(0);
        expect(subjects.every((subject) => subject?.package === "demo")).toBe(true);
    });
});

describe("history navigation", () => {
    async function loadTwoEntries(visibleColumns: Ref<ReadonlySet<string>>) {
        const composable = useHistory(visibleColumns);
        composable.loadPackageJsonText(JSON.stringify({ name: "first" }));
        await vi.waitFor(() => expect(composable.isLoadingDeps.value).toBe(false));
        composable.loadPackageJsonText(JSON.stringify({ name: "second" }));
        await vi.waitFor(() => expect(composable.isLoadingDeps.value).toBe(false));
        return composable;
    }

    it("canGoBack/canGoForward reflect current position", async () => {
        stubFetchResolvesEmpty();
        const visibleColumns = ref(new Set<string>());
        const { canGoBack, canGoForward } = await loadTwoEntries(visibleColumns);

        expect(canGoBack.value).toBe(true);
        expect(canGoForward.value).toBe(false);
    });

    it("goBack/goForward move between entries, restore pkg", async () => {
        stubFetchResolvesEmpty();
        const visibleColumns = ref(new Set<string>());
        const { goBack, goForward, pkg, canGoBack, canGoForward } =
            await loadTwoEntries(visibleColumns);

        expect(pkg.value?.name).toBe("second");

        goBack();
        expect(pkg.value?.name).toBe("first");
        expect(canGoBack.value).toBe(false);
        expect(canGoForward.value).toBe(true);

        goForward();
        expect(pkg.value?.name).toBe("second");
    });

    it("goBack no-op at start", async () => {
        stubFetchResolvesEmpty();
        const visibleColumns = ref(new Set<string>());
        const { goBack, pkg } = await loadTwoEntries(visibleColumns);

        goBack();
        goBack();
        goBack();

        expect(pkg.value?.name).toBe("first");
    });

    it("goForward no-op at end", async () => {
        stubFetchResolvesEmpty();
        const visibleColumns = ref(new Set<string>());
        const { goForward, pkg, historyIndex } = await loadTwoEntries(visibleColumns);

        goForward();

        expect(pkg.value?.name).toBe("second");
        expect(historyIndex.value).toBe(1);
    });

    it("revisiting fetched entry reuses cached deps, no refetch", async () => {
        stubFetchResolvesEmpty();
        const visibleColumns = ref(new Set<string>());
        const { goBack, goForward, deps } = await loadTwoEntries(visibleColumns);
        const fetchSpy = vi.mocked(fetch);

        goBack();
        const callsAfterBack = fetchSpy.mock.calls.length;
        goForward();

        expect(fetchSpy.mock.calls.length).toBe(callsAfterBack);
        expect(deps.value).toBeDefined();
    });
});

describe("entry source", () => {
    it("tags entry with given source, null without one", () => {
        stubFetchResolvesEmpty();
        const { loadPackageJsonText, history } = useHistory(ref(new Set<string>()));
        const source = { kind: "dependency", name: "left-pad", version: "^1.0.0" } as const;

        loadPackageJsonText(validPackageJson);
        loadPackageJsonText(validPackageJson, null, source);

        expect(history.value.map((entry) => entry.source)).toEqual([null, source]);
    });
});

describe("workspace context", () => {
    it("exposes current entry workspace, restores on goBack/goForward", () => {
        stubFetchResolvesEmpty();
        const { loadPackageJsonText, goBack, goForward, workspace } = useHistory(
            ref(new Set<string>()),
        );

        loadPackageJsonText(validPackageJson, rootWorkspaceContext);
        loadPackageJsonText(validPackageJson, { ...rootWorkspaceContext, current: "packages/a" });
        loadPackageJsonText(validPackageJson);

        expect(workspace.value).toBeNull();
        goBack();
        expect(workspace.value?.current).toBe("packages/a");
        goBack();
        expect(workspace.value).toEqual(rootWorkspaceContext);
        goForward();
        expect(workspace.value?.current).toBe("packages/a");
    });
});

describe("reacting to visibleColumns changes", () => {
    it("re-fetches current entry on visibleColumns change", async () => {
        stubFetchResolvesEmpty();
        const visibleColumns = ref(new Set<string>());
        const { loadPackageJsonText, isLoadingDeps } = useHistory(visibleColumns);

        loadPackageJsonText(validPackageJson);
        await vi.waitFor(() => expect(isLoadingDeps.value).toBe(false));
        const fetchSpy = vi.mocked(fetch);
        const callsBefore = fetchSpy.mock.calls.length;

        visibleColumns.value = new Set(["license"]);
        await nextTick();

        await vi.waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsBefore));
    });
});

describe("empty history", () => {
    it("ignores column, token and proxy changes before first load", async () => {
        stubFetchResolvesEmpty();
        const visibleColumns = ref(new Set<string>());
        const { pkg, deps, isLoadingDeps } = useHistory(visibleColumns);

        visibleColumns.value = new Set(["license"]);
        githubToken.value = "abc";
        settings.proxyUrl = "https://p.test/";
        await flushPromises();

        expect(fetch).not.toHaveBeenCalled();
        expect(pkg.value).toBeNull();
        expect(deps.value).toEqual([]);
        expect(isLoadingDeps.value).toBe(false);
    });
});

describe("async fetch ordering", () => {
    type PendingRequest = { url: string; resolve: (response: unknown) => void };

    /** Fetch mock whose requests stay pending until released by URL fragment. */
    function deferredFetch() {
        const pending: PendingRequest[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn((url: string) => new Promise((resolve) => pending.push({ url, resolve }))),
        );
        return async function release(urlFragment: string, body: unknown) {
            for (const request of pending.filter((p) => p.url.includes(urlFragment))) {
                request.resolve(jsonResponse(body));
            }
            await flushPromises();
        };
    }

    async function flushPromises() {
        for (let i = 0; i < 20; i++) {
            await Promise.resolve();
        }
        await nextTick();
    }

    function packageJsonWith(dependency: string) {
        return JSON.stringify({ name: dependency, dependencies: { [dependency]: "1.0.0" } });
    }

    it("ignores late result of entry replaced at same index", async () => {
        const release = deferredFetch();
        const visibleColumns = ref(new Set(["weeklyDownloads"]));
        const { loadPackageJsonText, goBack, deps } = useHistory(visibleColumns);
        loadPackageJsonText(packageJsonWith("first"));
        await release("/first", { downloads: 1 });
        loadPackageJsonText(packageJsonWith("slow"));
        goBack();
        loadPackageJsonText(packageJsonWith("latest"));

        await release("/slow", { downloads: 2 });
        expect(deps.value.map((d) => d.name)).not.toContain("slow");
        await release("/latest", { downloads: 3 });

        expect(deps.value.map((d) => d.name)).toEqual(["latest"]);
    });

    it("keeps newest fetch when older fetch of same entry finishes later", async () => {
        const release = deferredFetch();
        const visibleColumns = ref(new Set(["vulnerabilityCount"]));
        const { loadPackageJsonText, deps, isLoadingDeps } = useHistory(visibleColumns);
        loadPackageJsonText(packageJsonWith("pkg"));
        visibleColumns.value = new Set(["weeklyDownloads"]);
        await nextTick();

        await release("api.npmjs.org/downloads", { downloads: 5 });
        await release("api.osv.dev", { vulns: [] });

        expect((deps.value[0] as PackageInfo).weeklyDownloads).toBe(5);
        expect((deps.value[0] as PackageInfo).vulnerabilityCount).toBeNull();
        expect(isLoadingDeps.value).toBe(false);
    });

    it("keeps cached rows when columns toggle back mid-fetch", async () => {
        const release = deferredFetch();
        const visibleColumns = ref<ReadonlySet<string>>(new Set(["weeklyDownloads"]));
        const { loadPackageJsonText, deps, isLoadingDeps } = useHistory(visibleColumns);
        loadPackageJsonText(packageJsonWith("pkg"));
        await release("api.npmjs.org/downloads", { downloads: 5 });
        visibleColumns.value = new Set(["vulnerabilityCount"]);
        await nextTick();
        visibleColumns.value = new Set(["weeklyDownloads"]);
        await nextTick();

        await release("api.osv.dev", { vulns: [] });

        expect((deps.value[0] as PackageInfo).weeklyDownloads).toBe(5);
        expect(isLoadingDeps.value).toBe(false);
    });

    it("keeps rows, marks only shown column pending until its data loads", async () => {
        const release = deferredFetch();
        const visibleColumns = ref<ReadonlySet<string>>(new Set(["weeklyDownloads"]));
        const { loadPackageJsonText, deps, isLoadingDeps, pendingColumns } =
            useHistory(visibleColumns);
        loadPackageJsonText(packageJsonWith("pkg"));
        await release("api.npmjs.org/downloads", { downloads: 5 });

        visibleColumns.value = new Set(["weeklyDownloads", "vulnerabilityCount"]);
        await nextTick();

        expect((deps.value[0] as PackageInfo).weeklyDownloads).toBe(5);
        expect(isLoadingDeps.value).toBe(false);
        expect(pendingColumns.value).toEqual(new Set(["vulnerabilityCount"]));

        await release("api.osv.dev", { vulns: [] });

        expect((deps.value[0] as PackageInfo).vulnerabilityCount).toBe(0);
        expect(pendingColumns.value).toEqual(new Set());
    });

    it("clears pending columns on back navigation mid column fetch", async () => {
        const release = deferredFetch();
        const visibleColumns = ref<ReadonlySet<string>>(new Set(["weeklyDownloads"]));
        const { loadPackageJsonText, goBack, deps, pendingColumns } = useHistory(visibleColumns);
        loadPackageJsonText(packageJsonWith("first"));
        await release("/first", { downloads: 1 });
        loadPackageJsonText(packageJsonWith("second"));
        await release("/second", { downloads: 2 });
        visibleColumns.value = new Set(["weeklyDownloads", "vulnerabilityCount"]);
        await nextTick();
        expect(pendingColumns.value).toEqual(new Set(["vulnerabilityCount"]));

        goBack();
        await release("api.osv.dev", { vulns: [] });

        expect(pendingColumns.value).toEqual(new Set());
        expect(deps.value.map((d) => d.name)).toEqual(["first"]);
        expect((deps.value[0] as PackageInfo).vulnerabilityCount).toBe(0);
    });

    it("clears pending columns on proxy refetch mid column fetch", async () => {
        const release = deferredFetch();
        const visibleColumns = ref<ReadonlySet<string>>(new Set(["weeklyDownloads"]));
        const { loadPackageJsonText, deps, isLoadingDeps, pendingColumns } =
            useHistory(visibleColumns);
        loadPackageJsonText(packageJsonWith("pkg"));
        await release("api.npmjs.org/downloads", { downloads: 5 });
        visibleColumns.value = new Set(["weeklyDownloads", "vulnerabilityCount"]);
        await nextTick();

        settings.proxyUrl = "https://p.test/";
        await nextTick();

        expect(pendingColumns.value).toEqual(new Set());
        expect(isLoadingDeps.value).toBe(true);
        await release("api.npmjs.org/downloads", { downloads: 6 });
        await release("api.osv.dev", { vulns: [] });
        expect((deps.value[0] as PackageInfo).weeklyDownloads).toBe(6);
        expect(isLoadingDeps.value).toBe(false);
    });

    it("hides column without fetch or loading state", async () => {
        const release = deferredFetch();
        const visibleColumns = ref<ReadonlySet<string>>(
            new Set(["weeklyDownloads", "vulnerabilityCount"]),
        );
        const { loadPackageJsonText, deps, isLoadingDeps, pendingColumns } =
            useHistory(visibleColumns);
        loadPackageJsonText(packageJsonWith("pkg"));
        await release("api.npmjs.org/downloads", { downloads: 5 });
        await release("api.osv.dev", { vulns: [] });
        const rowsBefore = deps.value;
        const callsBefore = vi.mocked(fetch).mock.calls.length;

        visibleColumns.value = new Set(["weeklyDownloads"]);
        await nextTick();

        expect(deps.value).toBe(rowsBefore);
        expect(isLoadingDeps.value).toBe(false);
        expect(pendingColumns.value).toEqual(new Set());
        expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore);
    });

    it("stops table fetch of replaced entry, refetches on revisit", async () => {
        const release = deferredFetch();
        settings.fetchConcurrency = 1;
        const visibleColumns = ref(new Set(["weeklyDownloads"]));
        const { loadPackageJsonText, goBack, deps } = useHistory(visibleColumns);
        loadPackageJsonText(JSON.stringify({ dependencies: { early: "1.0.0", late: "1.0.0" } }));
        loadPackageJsonText(packageJsonWith("next"));

        await release("/early", { downloads: 1 });
        await release("/next", { downloads: 2 });

        expect(countFetchCalls(vi.mocked(fetch), "/late")).toBe(0);
        goBack();
        await flushPromises();
        await release("/late", { downloads: 3 });
        expect(deps.value.map((d) => d.name)).toEqual(["early", "late"]);
    });

    it("clears previous rows from list with nothing to fetch", async () => {
        const release = deferredFetch();
        const visibleColumns = ref(new Set(["weeklyDownloads"]));
        const { loadPackageJsonText, deps, isLoadingDeps } = useHistory(visibleColumns);
        loadPackageJsonText(packageJsonWith("first"));
        await release("/first", { downloads: 1 });

        loadPackageJsonText(JSON.stringify({ devDependencies: { slow: "1.0.0" } }));

        expect(isLoadingDeps.value).toBe(false);
        expect(deps.value).toEqual([]);
        await release("/slow", { downloads: 2 });
    });

    it("refetches entry with failed rows on revisit", async () => {
        const fetchMock = vi.fn(async () => {
            throw new TypeError("Failed to fetch");
        });
        vi.stubGlobal("fetch", fetchMock);
        const visibleColumns = ref(new Set(["latestVersion"]));
        const { loadPackageJsonText, goBack, deps } = useHistory(visibleColumns);
        loadPackageJsonText(packageJsonWith("broken"));
        await flushPromises();
        loadPackageJsonText(packageJsonWith("other"));
        await flushPromises();
        const callsBeforeRevisit = fetchMock.mock.calls.length;

        goBack();
        await flushPromises();

        expect(deps.value[0]).toMatchObject({ name: "broken", error: "Failed to fetch" });
        expect(fetchMock.mock.calls.length).toBe(callsBeforeRevisit + 1);
    });

    it("keeps revisit refetch of failed rows when column hidden mid-fetch", async () => {
        let isFailing = true;
        const pending: Array<() => void> = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(() => {
                if (isFailing) {
                    return Promise.reject(new TypeError("Failed to fetch"));
                }
                return new Promise((resolve) => {
                    pending.push(() => resolve(jsonResponse(minimalRegistryDoc)));
                });
            }),
        );
        const visibleColumns = ref<ReadonlySet<string>>(
            new Set(["latestVersion", "weeklyDownloads"]),
        );
        const { loadPackageJsonText, goBack, deps, isLoadingDeps } = useHistory(visibleColumns);
        loadPackageJsonText(packageJsonWith("broken"));
        await flushPromises();
        loadPackageJsonText(packageJsonWith("other"));
        await flushPromises();
        isFailing = false;
        goBack();
        await flushPromises();

        visibleColumns.value = new Set(["latestVersion"]);
        await nextTick();

        expect(isLoadingDeps.value).toBe(true);
        expect(deps.value).toEqual([]);
        for (const resolve of pending) {
            resolve();
        }
        await flushPromises();
        expect(deps.value[0]).toMatchObject({ name: "broken", latestVersion: "1.0.0" });
        expect(isLoadingDeps.value).toBe(false);
    });

    it("clears load error on back navigation", async () => {
        stubFetchResolvesEmpty();
        const visibleColumns = ref(new Set<string>());
        const { loadPackageJsonText, goBack, loadError } = useHistory(visibleColumns);
        loadPackageJsonText(packageJsonWith("a"));
        loadPackageJsonText(packageJsonWith("b"));
        loadPackageJsonText("{bad");

        goBack();

        expect(loadError.value).toBeNull();
    });

    describe("fetchRowsWithColumns", () => {
        const COLUMNS_WITH_VULNERABILITIES = new Set(["weeklyDownloads", "vulnerabilityCount"]);

        it("returns cached rows for covered columns, no fetch", async () => {
            const release = deferredFetch();
            const visibleColumns = ref<ReadonlySet<string>>(COLUMNS_WITH_VULNERABILITIES);
            const { loadPackageJsonText, deps, fetchedColumns, fetchRowsWithColumns } =
                useHistory(visibleColumns);
            loadPackageJsonText(packageJsonWith("pkg"));
            expect(fetchedColumns.value).toEqual(new Set());
            await release("api.npmjs.org/downloads", { downloads: 5 });
            await release("api.osv.dev", { vulns: [] });
            const callsBefore = vi.mocked(fetch).mock.calls.length;

            const rows = await fetchRowsWithColumns("deps", new Set(["weeklyDownloads"]));

            expect(rows).toBe(deps.value);
            expect(fetchedColumns.value).toEqual(COLUMNS_WITH_VULNERABILITIES);
            expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore);
        });

        it("fetches only missing column, leaves table rows and entry cache", async () => {
            const release = deferredFetch();
            const visibleColumns = ref<ReadonlySet<string>>(new Set(["weeklyDownloads"]));
            const {
                loadPackageJsonText,
                deps,
                isLoadingDeps,
                pendingColumns,
                fetchedColumns,
                fetchRowsWithColumns,
            } = useHistory(visibleColumns);
            loadPackageJsonText(packageJsonWith("pkg"));
            await release("api.npmjs.org/downloads", { downloads: 5 });
            const rowsBefore = deps.value;
            const downloadCalls = countFetchCalls(vi.mocked(fetch), "api.npmjs.org/downloads");

            const result = fetchRowsWithColumns("deps", COLUMNS_WITH_VULNERABILITIES);
            await flushPromises();
            expect(isLoadingDeps.value).toBe(false);
            expect(pendingColumns.value).toEqual(new Set());
            await release("api.osv.dev", { vulns: [] });
            const rows = (await result) as PackageInfo[];

            expect(rows[0]).toMatchObject({ weeklyDownloads: 5, vulnerabilityCount: 0 });
            expect(countFetchCalls(vi.mocked(fetch), "api.npmjs.org/downloads")).toBe(
                downloadCalls,
            );
            expect(deps.value).toBe(rowsBefore);
            expect(fetchedColumns.value).toEqual(new Set(["weeklyDownloads"]));
        });

        it("returns null once entry switched mid-fetch", async () => {
            const release = deferredFetch();
            const visibleColumns = ref<ReadonlySet<string>>(new Set(["weeklyDownloads"]));
            const { loadPackageJsonText, fetchRowsWithColumns } = useHistory(visibleColumns);
            loadPackageJsonText(packageJsonWith("first"));
            await release("/first", { downloads: 1 });

            const result = fetchRowsWithColumns("deps", COLUMNS_WITH_VULNERABILITIES);
            await flushPromises();
            loadPackageJsonText(packageJsonWith("second"));
            await release("api.osv.dev", { vulns: [] });

            expect(await result).toBeNull();
        });
    });
});

describe("settings refetch", () => {
    const PACKAGE_NAME = "settings-refetch-pkg";
    const REPO_API_URL = `${GITHUB_API_URL}/repos/settings-org/settings-repo`;

    /** GitHub repo answer: 403 (rate limit) unless the request carries a token. */
    function githubStarsResponse(init: RequestInit) {
        if (!new Headers(init.headers).has("Authorization")) {
            return statusResponse(HTTP_STATUS.forbidden);
        }
        return jsonResponse({ stargazers_count: 7 });
    }

    function registryDocWithRepo(repo: string) {
        return jsonResponse({
            ...minimalRegistryDoc,
            repository: { url: `git+https://github.com/settings-org/${repo}.git` },
        });
    }

    /** Registry doc for every URL; GitHub answers 403 (rate limit) unless authorized. */
    function stubGithubRateLimitedWithoutToken() {
        const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
            if (url.includes(GITHUB_API_URL)) {
                return githubStarsResponse(init);
            }
            return registryDocWithRepo("settings-repo");
        });
        vi.stubGlobal("fetch", fetchMock);
        return fetchMock;
    }

    function loadInScope(columns: string[]) {
        const history = useHistory(ref(new Set(columns)));
        history.loadPackageJsonText(JSON.stringify({ dependencies: { [PACKAGE_NAME]: "1.0.0" } }));
        return history;
    }

    it("refetches with Authorization after token set", async () => {
        const fetchMock = stubGithubRateLimitedWithoutToken();
        const { deps } = loadInScope(["gitStars"]);
        await flushPromises();
        expect((deps.value[0] as PackageInfo).gitStars).toBeNull();

        githubToken.value = "abc";
        await flushPromises();

        const calls = fetchCallsTo(fetchMock, REPO_API_URL);
        expect(calls).toHaveLength(2);
        expect(calls[1][1].headers.Authorization).toBe("Bearer abc");
        expect((deps.value[0] as PackageInfo).gitStars).toBe(7);
    });

    it("skips refetch on token purge", async () => {
        githubToken.value = "abc";
        const fetchMock = stubGithubRateLimitedWithoutToken();
        loadInScope(["gitStars"]);
        await flushPromises();

        githubToken.value = undefined;
        await flushPromises();

        expect(fetchCallsTo(fetchMock, REPO_API_URL)).toHaveLength(1);
    });

    it("refetches entry whose load spanned token change", async () => {
        let releaseGated = () => {};
        const gate = new Promise<void>((resolve) => {
            releaseGated = resolve;
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, init: RequestInit = {}) => {
                if (url.includes(GITHUB_API_URL)) {
                    return githubStarsResponse(init);
                }
                const name = url.split("/").pop();
                if (name === "gated-pkg") {
                    await gate;
                }
                return registryDocWithRepo(name!);
            }),
        );
        const { loadPackageJsonText, goBack, deps } = useHistory(ref(new Set(["gitStars"])));
        loadPackageJsonText(JSON.stringify({ dependencies: { "gated-pkg": "1.0.0" } }));
        loadPackageJsonText(JSON.stringify({ dependencies: { "other-pkg": "1.0.0" } }));
        await flushPromises();

        githubToken.value = "abc";
        await flushPromises();
        releaseGated();
        await flushPromises();
        goBack();
        await flushPromises();

        expect((deps.value[0] as PackageInfo).gitStars).toBe(7);
    });

    it("refetches GitHub lookup in flight at token set with Authorization", async () => {
        let releaseAnonymous = () => {};
        const gate = new Promise<void>((resolve) => {
            releaseAnonymous = resolve;
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, init: RequestInit = {}) => {
                if (!url.includes(GITHUB_API_URL)) {
                    return registryDocWithRepo("settings-repo");
                }
                if (!new Headers(init.headers).has("Authorization")) {
                    await gate;
                }
                return githubStarsResponse(init);
            }),
        );
        const { deps } = loadInScope(["gitStars"]);
        await flushPromises();

        githubToken.value = "abc";
        await flushPromises();
        releaseAnonymous();
        await flushPromises();

        expect((deps.value[0] as PackageInfo).gitStars).toBe(7);
    });

    it("clears cache, refetches through new proxy", async () => {
        const fetchMock = stubGithubRateLimitedWithoutToken();
        loadInScope(["latestVersion"]);
        await flushPromises();

        settings.proxyUrl = "https://p.test/";
        await flushPromises();

        expect(fetchCallsTo(fetchMock, PACKAGE_NAME).map(([url]) => url)).toEqual([
            `${NPM_REGISTRY_URL}/${PACKAGE_NAME}`,
            `https://p.test/${NPM_REGISTRY_URL}/${PACKAGE_NAME}`,
        ]);
    });
});

describe("retryFailedRows", () => {
    const DOWNLOADS_URL = "last-week/pkg";

    type PendingRequest = {
        url: string;
        resolve: (response: unknown) => void;
        reject: (error: Error) => void;
    };

    /** Fetch mock whose requests stay pending until answered by URL fragment. */
    function pendingFetch() {
        const pending: PendingRequest[] = [];
        vi.stubGlobal(
            "fetch",
            vi.fn(
                (url: string) =>
                    new Promise((resolve, reject) => pending.push({ url, resolve, reject })),
            ),
        );
        /** Answers pending requests matching `urlFragment` with `body`; an Error body fails them. */
        return async function answer(urlFragment: string, body: unknown) {
            const matching = pending.filter((p) => p.url.includes(urlFragment));
            for (const request of matching) {
                pending.splice(pending.indexOf(request), 1);
                if (body instanceof Error) {
                    request.reject(body);
                } else {
                    request.resolve(jsonResponse(body));
                }
            }
            await flushPromises();
        };
    }

    /** Loads `packageJson`; registry answers, weeklyDownloads lookup fails. */
    async function loadWithFailedDownloads(
        packageJson: object,
        visibleColumns: Ref<ReadonlySet<string>> = ref(new Set(["weeklyDownloads"])),
    ) {
        const answer = pendingFetch();
        const history = useHistory(visibleColumns);
        history.loadPackageJsonText(JSON.stringify(packageJson));
        await answer("registry.npmjs.org", minimalRegistryDoc);
        await answer(DOWNLOADS_URL, new TypeError("Failed to fetch"));
        return { ...history, answer };
    }

    it("replaces failed rows in deps, devDeps and entry cache", async () => {
        const { deps, devDeps, history, retryFailedRows, answer } = await loadWithFailedDownloads({
            dependencies: { pkg: "1.0.0" },
            devDependencies: { pkg: "1.0.0" },
        });
        expect(deps.value[0]).toMatchObject({
            failedLookups: { weeklyDownloads: "Failed to fetch" },
        });

        const retry = retryFailedRows(deps.value);
        await answer(DOWNLOADS_URL, { downloads: 5 });
        await retry;

        const expected = { name: "pkg", weeklyDownloads: 5, failedLookups: null };
        expect(deps.value[0]).toMatchObject(expected);
        expect(devDeps.value[0]).toMatchObject(expected);
        expect(history.value[0].deps![0]).toMatchObject(expected);
        expect(history.value[0].devDeps![0]).toMatchObject(expected);
    });

    it("keeps hidden column data in retried rows", async () => {
        const visibleColumns = ref<ReadonlySet<string>>(
            new Set(["weeklyDownloads", "latestVersion"]),
        );
        const { deps, retryFailedRows, answer } = await loadWithFailedDownloads(
            { dependencies: { pkg: "1.0.0" } },
            visibleColumns,
        );
        visibleColumns.value = new Set(["weeklyDownloads"]);
        await nextTick();

        const retry = retryFailedRows(deps.value);
        await answer(DOWNLOADS_URL, { downloads: 5 });
        await retry;
        visibleColumns.value = new Set(["weeklyDownloads", "latestVersion"]);
        await nextTick();

        expect(deps.value[0]).toMatchObject({ weeklyDownloads: 5, latestVersion: "1.0.0" });
    });

    it("refetches only retryable rows", async () => {
        const { deps, retryFailedRows, answer } = await loadWithFailedDownloads({
            dependencies: { pkg: "1.0.0" },
        });
        const liveRow = { ...(deps.value[0] as PackageInfo), name: "live", failedLookups: null };
        const callsBefore = vi.mocked(fetch).mock.calls.length;

        const retry = retryFailedRows([...deps.value, liveRow]);
        await answer(DOWNLOADS_URL, { downloads: 5 });
        await retry;

        const retriedUrls = vi
            .mocked(fetch)
            .mock.calls.slice(callsBefore)
            .map(([url]) => url);
        expect(retriedUrls).toEqual([expect.stringContaining(DOWNLOADS_URL)]);
    });

    it("flags retry in flight, ignores second retry meanwhile", async () => {
        const { deps, retryFailedRows, isRetrying, answer } = await loadWithFailedDownloads({
            dependencies: { pkg: "1.0.0" },
        });
        const callsBefore = vi.mocked(fetch).mock.calls.length;

        const retry = retryFailedRows(deps.value);
        await retryFailedRows(deps.value);

        expect(isRetrying.value).toBe(true);
        expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore + 1);
        await answer(DOWNLOADS_URL, { downloads: 5 });
        await retry;
        expect(isRetrying.value).toBe(false);
    });

    it("drops result once entry switched mid-retry", async () => {
        const { deps, history, loadPackageJsonText, retryFailedRows, answer } =
            await loadWithFailedDownloads({ dependencies: { pkg: "1.0.0" } });

        const retry = retryFailedRows(deps.value);
        loadPackageJsonText(JSON.stringify({ dependencies: { other: "1.0.0" } }));
        await answer("/other", { downloads: 1 });
        await answer(DOWNLOADS_URL, { downloads: 5 });
        await retry;

        expect(deps.value.map((d) => d.name)).toEqual(["other"]);
        expect(history.value[0].deps![0]).toMatchObject({ weeklyDownloads: null });
    });

    it("drops result once newer full fetch replaced rows", async () => {
        const visibleColumns = ref<ReadonlySet<string>>(new Set(["weeklyDownloads"]));
        const { deps, retryFailedRows, answer } = await loadWithFailedDownloads(
            { dependencies: { pkg: "1.0.0" } },
            visibleColumns,
        );

        const retry = retryFailedRows(deps.value);
        visibleColumns.value = new Set(["vulnerabilityCount"]);
        await nextTick();
        await answer("api.osv.dev", { vulns: [] });
        await answer(DOWNLOADS_URL, { downloads: 5 });
        await retry;

        expect(deps.value[0]).toMatchObject({ vulnerabilityCount: 0, weeklyDownloads: null });
    });

    it("keeps result when column hidden mid-retry", async () => {
        const visibleColumns = ref<ReadonlySet<string>>(
            new Set(["weeklyDownloads", "latestVersion"]),
        );
        const { deps, history, retryFailedRows, answer } = await loadWithFailedDownloads(
            { dependencies: { pkg: "1.0.0" } },
            visibleColumns,
        );

        const retry = retryFailedRows(deps.value);
        visibleColumns.value = new Set(["weeklyDownloads"]);
        await nextTick();
        await answer(DOWNLOADS_URL, { downloads: 5 });
        await retry;

        expect(deps.value[0]).toMatchObject({ weeklyDownloads: 5, failedLookups: null });
        expect(history.value[0].deps![0]).toMatchObject({ weeklyDownloads: 5 });
    });

    it("skips retry while shown column loads", async () => {
        const visibleColumns = ref<ReadonlySet<string>>(new Set(["weeklyDownloads"]));
        const { deps, retryFailedRows, isRetrying, pendingColumns } = await loadWithFailedDownloads(
            { dependencies: { pkg: "1.0.0" } },
            visibleColumns,
        );
        visibleColumns.value = new Set(["weeklyDownloads", "vulnerabilityCount"]);
        await nextTick();
        expect(pendingColumns.value.size).toBe(1);
        const callsBefore = vi.mocked(fetch).mock.calls.length;

        await retryFailedRows(deps.value);

        expect(isRetrying.value).toBe(false);
        expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore);
    });

    it("skips fetch for rows with nothing to retry", async () => {
        const { deps, retryFailedRows, isRetrying } = await loadWithFailedDownloads({
            dependencies: { pkg: "1.0.0" },
        });
        const liveRow = { ...(deps.value[0] as PackageInfo), failedLookups: null };
        const callsBefore = vi.mocked(fetch).mock.calls.length;

        await retryFailedRows([liveRow]);

        expect(isRetrying.value).toBe(false);
        expect(vi.mocked(fetch).mock.calls.length).toBe(callsBefore);
    });

    it("skips retry while full fetch runs", async () => {
        const answer = pendingFetch();
        const { loadPackageJsonText, retryFailedRows, isRetrying } = useHistory(
            ref(new Set(["weeklyDownloads"])),
        );
        loadPackageJsonText(JSON.stringify({ dependencies: { pkg: "1.0.0" } }));

        await retryFailedRows([{ name: "pkg", version: "1.0.0", error: "Failed to fetch" }]);

        expect(isRetrying.value).toBe(false);
        expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
        await answer("npmjs.org", minimalRegistryDoc);
    });
});
