import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { effectScope, ref, nextTick } from "vue";
import type { EffectScope } from "vue";
import { flushPromises } from "@vue/test-utils";
import { usePackageJsonHistory } from "../../../src/composables/usePackageJsonHistory";
import { clearPackageInfoCache } from "../../../src/api/npmPackage";
import { SETTINGS_DEFAULTS, githubToken, settings } from "../../../src/settings";
import { HTTP_STATUS, jsonResponse, statusResponse } from "../../helpers/fetchMock";
import { minimalRegistryDoc } from "../../fixtures/dependencies";

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

beforeEach(() => {
    clearPackageInfoCache();
});

describe("loadPackageJsonText", () => {
    it("records and applies new history entry for valid JSON", () => {
        stubFetchResolvesEmpty();
        const visibleColumns = ref(new Set<string>());
        const { loadPackageJsonText, pkg, history, historyIndex, loadError } =
            usePackageJsonHistory(visibleColumns);

        const result = loadPackageJsonText(validPackageJson);

        expect(result).toBe(true);
        expect(pkg.value).toEqual(JSON.parse(validPackageJson));
        expect(history.value).toHaveLength(1);
        expect(historyIndex.value).toBe(0);
        expect(loadError.value).toBe(null);
    });

    it("sets loadError, keeps state for invalid JSON", () => {
        const visibleColumns = ref(new Set<string>());
        const { loadPackageJsonText, pkg, history, loadError } =
            usePackageJsonHistory(visibleColumns);

        const result = loadPackageJsonText("{not valid json");

        expect(result).toBe(false);
        expect(pkg.value).toBe(null);
        expect(history.value).toHaveLength(0);
        expect(loadError.value).toContain("not valid JSON");
    });

    it("sets loadError for non-object JSON", () => {
        const visibleColumns = ref(new Set<string>());
        const { loadPackageJsonText, loadError } = usePackageJsonHistory(visibleColumns);

        const result = loadPackageJsonText("[]");

        expect(result).toBe(false);
        expect(loadError.value).toContain("expected a JSON object");
    });

    it("sets loadError, keeps state for non-string dependency version", () => {
        const visibleColumns = ref(new Set<string>());
        const { loadPackageJsonText, pkg, history, loadError } =
            usePackageJsonHistory(visibleColumns);

        const result = loadPackageJsonText(JSON.stringify({ dependencies: { "left-pad": 1 } }));

        expect(result).toBe(false);
        expect(pkg.value).toBe(null);
        expect(history.value).toHaveLength(0);
        expect(loadError.value).toContain("dependencies.left-pad");
    });

    it("clears previous loadError on successful load", () => {
        stubFetchResolvesEmpty();
        const visibleColumns = ref(new Set<string>());
        const { loadPackageJsonText, loadError } = usePackageJsonHistory(visibleColumns);

        loadPackageJsonText("{not valid json");
        expect(loadError.value).not.toBe(null);

        loadPackageJsonText(validPackageJson);
        expect(loadError.value).toBe(null);
    });

    it("fetches and populates deps for new entry", async () => {
        stubFetchResolvesEmpty();
        const visibleColumns = ref(new Set<string>());
        const { loadPackageJsonText, deps, isLoadingDeps } = usePackageJsonHistory(visibleColumns);

        loadPackageJsonText(validPackageJson);
        expect(isLoadingDeps.value).toBe(true);

        await vi.waitFor(() => expect(isLoadingDeps.value).toBe(false));
        expect(deps.value).toHaveLength(1);
        expect(deps.value[0].name).toBe("left-pad");
    });
});

describe("history navigation", () => {
    async function loadTwoEntries(visibleColumns) {
        const composable = usePackageJsonHistory(visibleColumns);
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

        expect(pkg.value.name).toBe("second");

        goBack();
        expect(pkg.value.name).toBe("first");
        expect(canGoBack.value).toBe(false);
        expect(canGoForward.value).toBe(true);

        goForward();
        expect(pkg.value.name).toBe("second");
    });

    it("goBack no-op at start", async () => {
        stubFetchResolvesEmpty();
        const visibleColumns = ref(new Set<string>());
        const { goBack, pkg } = await loadTwoEntries(visibleColumns);

        goBack();
        goBack();
        goBack();

        expect(pkg.value.name).toBe("first");
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

describe("reacting to visibleColumns changes", () => {
    it("re-fetches current entry on visibleColumns change", async () => {
        stubFetchResolvesEmpty();
        const visibleColumns = ref(new Set<string>());
        const { loadPackageJsonText, isLoadingDeps } = usePackageJsonHistory(visibleColumns);

        loadPackageJsonText(validPackageJson);
        await vi.waitFor(() => expect(isLoadingDeps.value).toBe(false));
        const fetchSpy = vi.mocked(fetch);
        const callsBefore = fetchSpy.mock.calls.length;

        visibleColumns.value = new Set(["license"]);
        await nextTick();

        await vi.waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(callsBefore));
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
        const { loadPackageJsonText, goBack, deps } = usePackageJsonHistory(visibleColumns);
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
        const { loadPackageJsonText, deps, isLoadingDeps } = usePackageJsonHistory(visibleColumns);
        loadPackageJsonText(packageJsonWith("pkg"));
        visibleColumns.value = new Set(["weeklyDownloads"]);
        await nextTick();

        await release("api.npmjs.org/downloads", { downloads: 5 });
        await release("api.osv.dev", { vulns: [] });

        expect(deps.value[0].weeklyDownloads).toBe(5);
        expect(deps.value[0].vulnerabilityCount).toBeNull();
        expect(isLoadingDeps.value).toBe(false);
    });

    it("clears previous rows from list with nothing to fetch", async () => {
        const release = deferredFetch();
        const visibleColumns = ref(new Set(["weeklyDownloads"]));
        const { loadPackageJsonText, deps, isLoadingDeps } = usePackageJsonHistory(visibleColumns);
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
        const { loadPackageJsonText, goBack, deps } = usePackageJsonHistory(visibleColumns);
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

    it("clears load error on back navigation", async () => {
        stubFetchResolvesEmpty();
        const visibleColumns = ref(new Set<string>());
        const { loadPackageJsonText, goBack, loadError } = usePackageJsonHistory(visibleColumns);
        loadPackageJsonText(packageJsonWith("a"));
        loadPackageJsonText(packageJsonWith("b"));
        loadPackageJsonText("{bad");

        goBack();

        expect(loadError.value).toBeNull();
    });
});

describe("settings refetch", () => {
    // Unique name: composables from earlier tests are never stopped and
    // still react to settings changes.
    const PACKAGE_NAME = "settings-refetch-pkg";
    const REPO_API_URL = "https://api.github.com/repos/settings-org/settings-repo";
    let scope: EffectScope;

    /** Registry doc for every URL; GitHub answers 403 (rate limit) unless authorized. */
    function stubGithubRateLimitedWithoutToken() {
        const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
            if (!url.includes("api.github.com")) {
                return jsonResponse({
                    ...minimalRegistryDoc,
                    repository: { url: "git+https://github.com/settings-org/settings-repo.git" },
                });
            }
            if (!new Headers(init.headers).has("Authorization")) {
                return statusResponse(HTTP_STATUS.forbidden);
            }
            return jsonResponse({ stargazers_count: 7 });
        });
        vi.stubGlobal("fetch", fetchMock);
        return fetchMock;
    }

    function loadInScope(columns: string[]) {
        scope = effectScope();
        const history = scope.run(() => usePackageJsonHistory(ref(new Set(columns))));
        history.loadPackageJsonText(JSON.stringify({ dependencies: { [PACKAGE_NAME]: "1.0.0" } }));
        return history;
    }

    function callsTo(fetchMock: ReturnType<typeof vi.fn>, fragment: string) {
        return fetchMock.mock.calls.filter(([url]) => url.includes(fragment));
    }

    afterEach(() => {
        scope.stop();
        githubToken.value = undefined;
        Object.assign(settings, SETTINGS_DEFAULTS);
    });

    it("refetches with Authorization after token set", async () => {
        const fetchMock = stubGithubRateLimitedWithoutToken();
        const { deps } = loadInScope(["gitStars"]);
        await flushPromises();
        expect(deps.value[0].gitStars).toBeNull();

        githubToken.value = "abc";
        await flushPromises();

        const calls = callsTo(fetchMock, REPO_API_URL);
        expect(calls).toHaveLength(2);
        expect(calls[1][1].headers.Authorization).toBe("Bearer abc");
        expect(deps.value[0].gitStars).toBe(7);
    });

    it("skips refetch on token purge", async () => {
        githubToken.value = "abc";
        const fetchMock = stubGithubRateLimitedWithoutToken();
        loadInScope(["gitStars"]);
        await flushPromises();

        githubToken.value = undefined;
        await flushPromises();

        expect(callsTo(fetchMock, REPO_API_URL)).toHaveLength(1);
    });

    it("refetches entry whose load spanned token change", async () => {
        let releaseGated = () => {};
        const gate = new Promise<void>((resolve) => {
            releaseGated = resolve;
        });
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string, init: RequestInit = {}) => {
                if (url.includes("api.github.com")) {
                    return new Headers(init.headers).has("Authorization")
                        ? jsonResponse({ stargazers_count: 7 })
                        : statusResponse(HTTP_STATUS.forbidden);
                }
                const name = url.split("/").pop();
                if (name === "gated-pkg") {
                    await gate;
                }
                return jsonResponse({
                    ...minimalRegistryDoc,
                    repository: { url: `git+https://github.com/settings-org/${name}.git` },
                });
            }),
        );
        scope = effectScope();
        const { loadPackageJsonText, goBack, deps } = scope.run(() =>
            usePackageJsonHistory(ref(new Set(["gitStars"]))),
        );
        loadPackageJsonText(JSON.stringify({ dependencies: { "gated-pkg": "1.0.0" } }));
        loadPackageJsonText(JSON.stringify({ dependencies: { "other-pkg": "1.0.0" } }));
        await flushPromises();

        githubToken.value = "abc";
        await flushPromises();
        releaseGated();
        await flushPromises();
        goBack();
        await flushPromises();

        expect(deps.value[0].gitStars).toBe(7);
    });

    it("clears cache, refetches through new proxy", async () => {
        const fetchMock = stubGithubRateLimitedWithoutToken();
        loadInScope(["latestVersion"]);
        await flushPromises();

        settings.proxyUrl = "https://p.test/";
        await flushPromises();

        expect(callsTo(fetchMock, PACKAGE_NAME).map(([url]) => url)).toEqual([
            `https://registry.npmjs.org/${PACKAGE_NAME}`,
            `https://p.test/https://registry.npmjs.org/${PACKAGE_NAME}`,
        ]);
    });
});
