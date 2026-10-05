import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, nextTick } from "vue";
import { usePackageJsonHistory } from "../../../src/composables/usePackageJsonHistory";
import { clearPackageInfoCache } from "../../../src/api/npmPackage";
import { jsonResponse } from "../../helpers/fetchMock";

/** Every fetch resolves with an empty-ish, valid-shaped response - enough
 * for fetchPackageInfo to complete without needing per-package data. */
function stubFetchResolvesEmpty() {
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => jsonResponse({ "dist-tags": { latest: "1.0.0" }, time: {} })),
    );
}

const validPackageJson = JSON.stringify({
    name: "demo",
    dependencies: { "left-pad": "^1.0.0" },
    devDependencies: {},
});

beforeEach(() => {
    vi.unstubAllGlobals();
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
