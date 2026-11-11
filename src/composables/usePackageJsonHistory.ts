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
import type { DependencyMap, PackageJson } from "../utils/packageJson";
import type { EntrySource, HistoryEntry } from "../utils/packageJsonHistory";
import type { WorkspaceContext } from "../utils/workspaces";
import type { DependencyRow, PackageInput } from "../types";
import { t } from "../i18n";
import { githubToken, settings } from "../settings";

function toPackageInputs(dependencies: DependencyMap | undefined) {
    return Object.entries(dependencies ?? {}).map(([name, version]) => ({ name, version }));
}

/** `rows` with each row of `replacement`'s name and version swapped for it. */
function replaceRow(rows: DependencyRow[], replacement: DependencyRow): DependencyRow[] {
    return rows.map((row) =>
        row.name === replacement.name && row.version === replacement.version ? replacement : row,
    );
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
    const pkg = ref<PackageJson | null>(null);
    const workspace = ref<WorkspaceContext | null>(null);
    const deps = ref<DependencyRow[]>([]);
    const devDeps = ref<DependencyRow[]>([]);
    const isLoadingDeps = ref(false);
    const isLoadingDevDeps = ref(false);
    const loadError = ref<string | null>(null);
    const history = ref<HistoryEntry[]>([]);
    const historyIndex = ref(-1);
    const canGoBack = computed(() => canGoBackPure(historyIndex.value));
    const canGoForward = computed(() => canGoForwardPure(history.value, historyIndex.value));
    // Latest fetch started per entry. A slower, older fetch for the same entry
    // (e.g. columns toggled mid-fetch) finishes later and must not win.
    const latestFetchByEntry = new WeakMap<HistoryEntry, symbol>();
    // Names of rows whose retry is in flight; a name is one row per table.
    const retryingPackages = ref(new Set<string>());

    function isCurrentEntry(entry: HistoryEntry) {
        return history.value[historyIndex.value] === entry;
    }

    /**
     * Validates raw package.json text and, on success, records it as a new
     * history entry and applies it. Returns true on success; on failure,
     * sets loadError and leaves the previous content untouched. `sourceWorkspace`
     * names the monorepo the text came from, if any; `source` says where a
     * share link can load the text again.
     */
    function loadPackageJsonText(
        text: string,
        sourceWorkspace: WorkspaceContext | null = null,
        source: EntrySource | null = null,
    ) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(text);
        } catch (err) {
            loadError.value = t("errors.invalidJson", { message: (err as SyntaxError).message });
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
            createHistoryEntry(text, result.data, sourceWorkspace, source),
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
        workspace.value = entry.workspace;
        if (isEntryCacheValid(entry, visibleColumns.value)) {
            // Columns toggled back mid-fetch: that fetch must not overwrite the cached rows.
            latestFetchByEntry.delete(toRaw(entry));
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
     * deps/devDeps and caches them on the entry. The fetch stops starting
     * rows once the entry is no longer current (position alone isn't enough,
     * since loading after going back reuses the same index) or a newer fetch
     * replaces it, so share link replay cannot pile up table fetches. A
     * stopped fetch caches nothing; a revisit refetches from memoized lookups.
     */
    async function fetchEntryDependencies(entry: HistoryEntry) {
        const fetchToken = Symbol();
        latestFetchByEntry.set(toRaw(entry), fetchToken);
        let isStopped = false;
        const isCancelled = () => {
            isStopped ||=
                !isCurrentEntry(entry) || latestFetchByEntry.get(toRaw(entry)) !== fetchToken;
            return isStopped;
        };
        const rawDeps = toPackageInputs(entry.pkg.dependencies);
        const rawDevDeps = toPackageInputs(entry.pkg.devDependencies);
        const visibleColumnsAtFetchTime = new Set(visibleColumns.value);
        // An empty list isn't shown as loading, so drop the previous entry's
        // rows now instead of showing them until the other list finishes.
        deps.value = [];
        devDeps.value = [];
        isLoadingDeps.value = rawDeps.length > 0;
        isLoadingDevDeps.value = rawDevDeps.length > 0;
        const fetchOptions = { visibleColumns: visibleColumnsAtFetchTime, isCancelled };
        const [depsResult, devDepsResult] = await Promise.all([
            fetchPackagesInfo(rawDeps, fetchOptions),
            fetchPackagesInfo(rawDevDeps, fetchOptions),
        ]);
        if (!depsResult || !devDepsResult || isCancelled()) {
            return;
        }
        entry.deps = depsResult;
        entry.devDeps = devDepsResult;
        entry.visibleColumnsSnapshot = visibleColumnsAtFetchTime;
        deps.value = depsResult;
        devDeps.value = devDepsResult;
        isLoadingDeps.value = false;
        isLoadingDevDeps.value = false;
    }

    /**
     * Refetches one package of the current entry under the current columns
     * and swaps it into the entry's cache and both tables (a package can be
     * in deps and devDeps). Failed lookups were evicted from the memo
     * caches, so the refetch goes live. Applies only while the same entry
     * is current and no full fetch started since; else the fresher rows win.
     * Skipped while a full fetch runs: it refetches the row anyway.
     *
     * @returns The new row, or null when it was not applied.
     */
    async function retryRow(input: PackageInput): Promise<DependencyRow | null> {
        const entry = history.value[historyIndex.value];
        const isFetching = isLoadingDeps.value || isLoadingDevDeps.value;
        if (
            !entry?.deps ||
            !entry.devDeps ||
            isFetching ||
            retryingPackages.value.has(input.name)
        ) {
            return null;
        }
        const fetchToken = latestFetchByEntry.get(toRaw(entry));
        retryingPackages.value.add(input.name);
        const rows = await fetchPackagesInfo([input], {
            visibleColumns: new Set(visibleColumns.value),
        });
        retryingPackages.value.delete(input.name);
        const isStillWanted =
            isCurrentEntry(entry) && latestFetchByEntry.get(toRaw(entry)) === fetchToken;
        if (!rows || !isStillWanted) {
            return null;
        }
        const [row] = rows;
        entry.deps = replaceRow(entry.deps, row);
        entry.devDeps = replaceRow(entry.devDeps, row);
        deps.value = entry.deps;
        devDeps.value = entry.devDeps;
        return row;
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
        workspace,
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
        retryingPackages,
        retryRow,
    };
}
