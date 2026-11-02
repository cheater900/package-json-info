import { ref, computed, watch, toRaw } from "vue";
import type { Ref } from "vue";
import { clearPackageInfoCache, fetchPackagesInfo } from "../api/npmPackage";
import {
    createHistoryEntry,
    pushHistoryEntry,
    canGoBack as canGoBackPure,
    canGoForward as canGoForwardPure,
    isEntryCacheValid,
} from "../utils/packageJsonHistory";
import { PackageJsonSchema, formatPackageJsonError } from "../utils/packageJson";
import type { DependencyMap } from "../utils/packageJson";
import { t } from "../i18n";
import { githubToken, settings } from "../settings";

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
export function usePackageJsonHistory(visibleColumns: Ref<ReadonlySet<string>>) {
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
    // Latest fetch started per entry. A slower, older fetch for the same entry
    // (e.g. columns toggled mid-fetch) finishes later and must not win.
    const latestFetchByEntry = new WeakMap();

    function isCurrentEntry(entry) {
        return history.value[historyIndex.value] === entry;
    }

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
            loadError.value = t("errors.invalidJson", { message: err.message });
            return false;
        }
        const result = PackageJsonSchema.safeParse(parsed);
        if (!result.success) {
            loadError.value = t("errors.invalidPackageJson", {
                details: formatPackageJsonError(result.error),
            });
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
        loadError.value = null;
        applyCurrentHistoryEntry();
    }

    function goForward() {
        if (!canGoForward.value) {
            return;
        }
        historyIndex.value += 1;
        loadError.value = null;
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
        fetchEntryDependencies(entry);
    }

    /**
     * Fetches (or re-fetches, if visibleColumns has changed) an entry's
     * deps/devDeps and caches them on the entry. Results apply to the view
     * only while this entry is still the current one; position alone isn't
     * enough, since loading after going back reuses the same index.
     */
    async function fetchEntryDependencies(entry) {
        const fetchToken = Symbol();
        latestFetchByEntry.set(toRaw(entry), fetchToken);
        const rawDeps = toPackageInputs(entry.pkg.dependencies);
        const rawDevDeps = toPackageInputs(entry.pkg.devDependencies);
        const visibleColumnsAtFetchTime = new Set(visibleColumns.value);
        // An empty list isn't shown as loading, so drop the previous entry's
        // rows now instead of showing them until the other list finishes.
        deps.value = [];
        devDeps.value = [];
        isLoadingDeps.value = rawDeps.length > 0;
        isLoadingDevDeps.value = rawDevDeps.length > 0;
        const [depsResult, devDepsResult] = await Promise.all([
            fetchPackagesInfo(rawDeps, { visibleColumns: visibleColumnsAtFetchTime }),
            fetchPackagesInfo(rawDevDeps, { visibleColumns: visibleColumnsAtFetchTime }),
        ]);
        if (latestFetchByEntry.get(toRaw(entry)) !== fetchToken) {
            return;
        }
        entry.deps = depsResult;
        entry.devDeps = devDepsResult;
        entry.visibleColumnsSnapshot = visibleColumnsAtFetchTime;
        if (!isCurrentEntry(entry)) {
            return;
        }
        deps.value = depsResult;
        devDeps.value = devDepsResult;
        isLoadingDeps.value = false;
        isLoadingDevDeps.value = false;
    }

    /**
     * Drops every entry's column snapshot so each one refetches when shown,
     * then refetches the current one. Cells that failed earlier (rate limit,
     * proxy) are cached as missing until then. Fetches still in flight
     * started under the old settings, so their results are discarded too.
     */
    function refetchAllEntries() {
        for (const entry of history.value) {
            entry.visibleColumnsSnapshot = null;
            latestFetchByEntry.delete(toRaw(entry));
        }
        applyCurrentHistoryEntry();
    }

    // A new token lifts the GitHub rate limit; purging it needs no refetch.
    watch(githubToken, (token) => {
        if (!token) {
            return;
        }
        refetchAllEntries();
    });

    watch(
        () => settings.proxyUrl,
        () => {
            clearPackageInfoCache();
            refetchAllEntries();
        },
    );

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
