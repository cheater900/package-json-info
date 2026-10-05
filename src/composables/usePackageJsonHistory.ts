import { ref, computed, watch } from "vue";
import { fetchPackagesInfo } from "../utils/npmPackage.ts";
import {
    createHistoryEntry,
    pushHistoryEntry,
    canGoBack as canGoBackPure,
    canGoForward as canGoForwardPure,
    isEntryCacheValid,
} from "../utils/packageJsonHistory.ts";
import { PackageJsonSchema, formatPackageJsonError } from "../utils/packageJson.ts";
import type { DependencyMap } from "../utils/packageJson.ts";

function toPackageInputs(dependencies: DependencyMap | undefined) {
    return Object.entries(dependencies ?? {}).map(([name, version]) => ({ name, version }));
}

/**
 * Owns the package.json history stack (back/forward navigation) and keeps
 * `deps`/`devDeps` in sync with the current entry, fetching (or re-fetching,
 * if `visibleColumns` has changed) as needed. Each loaded package.json
 * becomes a history entry, caching its own fetched deps/devDeps; navigating
 * back/forward restores an entry's cached data directly (no request) when
 * it's still valid for the current visibleColumns - otherwise (never
 * fetched, or fetched under a different column set) it fetches, though even
 * then npmPackage's own name/slug-level caching means only genuinely new
 * data triggers a request.
 */
export function usePackageJsonHistory(visibleColumns) {
    const pkg = ref(null);
    const deps = ref([]);
    const devDeps = ref([]);
    const isLoadingDeps = ref(false);
    const isLoadingDevDeps = ref(false);
    const loadError = ref(null);

    const history = ref([]);
    const historyIndex = ref(-1);

    const canGoBack = computed(() => canGoBackPure(historyIndex.value));
    const canGoForward = computed(() => canGoForwardPure(history.value, historyIndex.value));

    /**
     * Validates raw package.json text and, on success, records it as a new
     * history entry and applies it. Returns true on success; on failure,
     * sets loadError and leaves the previous content untouched.
     */
    function loadPackageJsonText(text) {
        let parsed;
        try {
            parsed = JSON.parse(text);
        } catch (err) {
            loadError.value = `That's not valid JSON: ${err.message}`;
            return false;
        }
        const result = PackageJsonSchema.safeParse(parsed);
        if (!result.success) {
            loadError.value = `Invalid package.json: ${formatPackageJsonError(result.error)}.`;
            return false;
        }
        loadError.value = null;

        const pushed = pushHistoryEntry(
            history.value,
            historyIndex.value,
            createHistoryEntry(text, result.data),
        );
        history.value = pushed.history;
        historyIndex.value = pushed.index;
        applyCurrentHistoryEntry();
        return true;
    }

    function goBack() {
        if (!canGoBack.value) {
            return;
        }
        historyIndex.value -= 1;
        applyCurrentHistoryEntry();
    }

    function goForward() {
        if (!canGoForward.value) {
            return;
        }
        historyIndex.value += 1;
        applyCurrentHistoryEntry();
    }

    function applyCurrentHistoryEntry() {
        const entry = history.value[historyIndex.value];
        if (!entry) {
            return;
        }

        pkg.value = entry.pkg;

        if (isEntryCacheValid(entry, visibleColumns.value)) {
            deps.value = entry.deps;
            devDeps.value = entry.devDeps;
            isLoadingDeps.value = false;
            isLoadingDevDeps.value = false;
            return;
        }

        fetchEntryDependencies(entry, historyIndex.value);
    }

    /**
     * Fetches (or re-fetches, if visibleColumns has changed) an entry's
     * deps/devDeps, caches the result on the entry itself, and - only if
     * the user hasn't navigated elsewhere in the meantime - applies it to
     * the visible state.
     */
    async function fetchEntryDependencies(entry, index) {
        const rawDeps = toPackageInputs(entry.pkg?.dependencies);
        const rawDevDeps = toPackageInputs(entry.pkg?.devDependencies);
        const visibleColumnsAtFetchTime = new Set(visibleColumns.value);

        if (historyIndex.value === index) {
            isLoadingDeps.value = rawDeps.length > 0;
            isLoadingDevDeps.value = rawDevDeps.length > 0;
        }

        const [depsResult, devDepsResult] = await Promise.all([
            rawDeps.length > 0
                ? fetchPackagesInfo(rawDeps, { visibleColumns: visibleColumnsAtFetchTime })
                : Promise.resolve([]),
            rawDevDeps.length > 0
                ? fetchPackagesInfo(rawDevDeps, { visibleColumns: visibleColumnsAtFetchTime })
                : Promise.resolve([]),
        ]);

        entry.deps = depsResult;
        entry.devDeps = devDepsResult;
        entry.visibleColumnsSnapshot = visibleColumnsAtFetchTime;

        if (historyIndex.value === index) {
            deps.value = depsResult;
            devDeps.value = devDepsResult;
            isLoadingDeps.value = false;
            isLoadingDevDeps.value = false;
        }
    }

    // When column visibility changes, re-check whether the current entry's
    // cached data still covers every visible column - and re-fetch if not.
    watch(
        visibleColumns,
        () => {
            applyCurrentHistoryEntry();
        },
        { deep: true },
    );

    return {
        pkg,
        deps,
        devDeps,
        isLoadingDeps,
        isLoadingDevDeps,
        loadError,
        history,
        historyIndex,
        canGoBack,
        canGoForward,
        goBack,
        goForward,
        loadPackageJsonText,
    };
}
