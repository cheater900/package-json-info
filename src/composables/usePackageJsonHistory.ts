import { ref, computed, watch, toRaw } from "vue";
import type { Ref } from "vue";
import { clearPackageInfoCache, fetchPackagesInfo } from "../api/npmPackage";
import {
    createHistoryEntry,
    pushHistoryEntry,
    canGoBack as canGoBackPure,
    canGoForward as canGoForwardPure,
    columnsMissingFrom,
    entryCoversColumns,
    isEntryCacheValid,
    isRowRetryable,
} from "../utils/packageJsonHistory";
import { PackageJsonSchema, formatPackageJsonError } from "../utils/packageJson";
import type { DependencyMap, PackageJson } from "../utils/packageJson";
import type { EntrySource, HistoryEntry } from "../utils/packageJsonHistory";
import type { WorkspaceContext } from "../utils/workspaces";
import type { DependencyListId, DependencyRow, PackageInput } from "../types";
import { t } from "../i18n";
import { githubToken, settings } from "../settings";

function toPackageInputs(dependencies: DependencyMap | undefined) {
    return Object.entries(dependencies ?? {}).map(([name, version]) => ({ name, version }));
}

function rowKey(row: PackageInput) {
    return `${row.name}@${row.version}`;
}

/** `rows` with each row of a replacement's name and version swapped for it. */
function replaceRows(rows: DependencyRow[], replacements: DependencyRow[]): DependencyRow[] {
    const byKey = new Map(replacements.map((row) => [rowKey(row), row]));
    return rows.map((row) => byKey.get(rowKey(row)) ?? row);
}

/**
 * Owns the package.json history stack (back/forward navigation) and keeps
 * `deps`/`devDeps` in sync with the current entry, fetching (or re-fetching,
 * if `visibleColumns` has changed) as needed. Each loaded package.json
 * becomes a history entry, caching its own fetched deps/devDeps; navigating
 * back/forward restores an entry's cached data directly (no request) when
 * it's still valid for the current visibleColumns - otherwise (never
 * fetched, or fetched without some visible column) it fetches, though even
 * then npmPackage's own name/slug-level caching means only genuinely new
 * data triggers a request. A column change keeps the shown rows: hiding a
 * column needs no fetch, showing one marks it in `pendingColumns` until
 * its data arrives.
 */
export function usePackageJsonHistory(visibleColumns: Ref<ReadonlySet<string>>) {
    const pkg = ref<PackageJson | null>(null);
    const workspace = ref<WorkspaceContext | null>(null);
    const deps = ref<DependencyRow[]>([]);
    const devDeps = ref<DependencyRow[]>([]);
    const isLoadingDeps = ref(false);
    const isLoadingDevDeps = ref(false);
    // Columns shown with the previous rows while their data loads.
    const pendingColumns = ref<ReadonlySet<string>>(new Set());
    const loadError = ref<string | null>(null);
    const history = ref<HistoryEntry[]>([]);
    const historyIndex = ref(-1);
    const canGoBack = computed(() => canGoBackPure(historyIndex.value));
    const canGoForward = computed(() => canGoForwardPure(history.value, historyIndex.value));
    // Latest fetch started per entry. A slower, older fetch for the same entry
    // (e.g. columns toggled mid-fetch) finishes later and must not win.
    const latestFetchByEntry = new WeakMap<HistoryEntry, symbol>();
    // True while a retry of failed rows is in flight.
    const isRetrying = ref(false);

    function isCurrentEntry(entry: HistoryEntry) {
        return history.value[historyIndex.value] === entry;
    }

    // Columns the current entry's rows hold data for; empty until its first fetch ends.
    const fetchedColumns = computed<ReadonlySet<string>>(
        () => history.value[historyIndex.value]?.visibleColumnsSnapshot ?? new Set(),
    );

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

    /**
     * Shows the current entry. `isColumnChange` keeps cached rows that still
     * cover every visible column as they are, without retrying failed rows,
     * and keeps the shown rows during a fetch for newly visible columns.
     */
    function applyCurrentHistoryEntry(isColumnChange = false) {
        const entry = history.value[historyIndex.value];
        if (!entry) {
            return;
        }
        pkg.value = entry.pkg;
        workspace.value = entry.workspace;
        // A full fetch in flight (revisit retrying failed rows) must outlive a column toggle.
        const isFullFetchRunning = isLoadingDeps.value || isLoadingDevDeps.value;
        const isCached =
            isEntryCacheValid(entry, visibleColumns.value) ||
            (isColumnChange &&
                !isFullFetchRunning &&
                entryCoversColumns(entry, visibleColumns.value));
        if (isCached) {
            // Columns toggled back mid-fetch: that fetch must not overwrite the cached rows.
            // A finished fetch keeps its token, so a retry in flight still applies.
            if (isFullFetchRunning || pendingColumns.value.size > 0) {
                latestFetchByEntry.delete(toRaw(entry));
            }
            deps.value = entry.deps;
            devDeps.value = entry.devDeps;
            isLoadingDeps.value = false;
            isLoadingDevDeps.value = false;
            pendingColumns.value = new Set();
            return;
        }
        fetchEntryDependencies(entry, isColumnChange);
    }

    /**
     * Fetches (or re-fetches, if visibleColumns has changed) an entry's
     * deps/devDeps and caches them on the entry. The fetch stops starting
     * rows once the entry is no longer current (position alone isn't enough,
     * since loading after going back reuses the same index) or a newer fetch
     * replaces it, so share link replay cannot pile up table fetches. A
     * stopped fetch caches nothing; a revisit refetches from memoized lookups.
     * `keepRows` leaves already fetched rows shown and marks only the columns
     * they lack as pending.
     */
    async function fetchEntryDependencies(entry: HistoryEntry, keepRows: boolean) {
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
        if (keepRows && entry.deps !== null && entry.devDeps !== null) {
            pendingColumns.value = columnsMissingFrom(
                entry.visibleColumnsSnapshot,
                visibleColumnsAtFetchTime,
            );
        } else {
            // An empty list isn't shown as loading, so drop the previous entry's
            // rows now instead of showing them until the other list finishes.
            deps.value = [];
            devDeps.value = [];
            isLoadingDeps.value = rawDeps.length > 0;
            isLoadingDevDeps.value = rawDevDeps.length > 0;
            pendingColumns.value = new Set();
        }
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
        pendingColumns.value = new Set();
    }

    /**
     * Refetches the retryable rows among `rows` (one table's rows) under the
     * columns the entry was fetched with, and swaps them into the entry's
     * cache and both tables (a package can be in deps and devDeps). Failed
     * lookups were evicted from the memo caches, so the refetch goes live.
     * Applies only while the same entry is current and no full fetch started
     * since; else the fresher rows win. Skipped while a table or column
     * fetch runs: it refetches the rows anyway.
     */
    async function retryFailedRows(rows: readonly DependencyRow[]): Promise<void> {
        const entry = history.value[historyIndex.value];
        const isFetching =
            isLoadingDeps.value || isLoadingDevDeps.value || pendingColumns.value.size > 0;
        if (!entry?.deps || !entry.devDeps || isFetching || isRetrying.value) {
            return;
        }
        const inputs = rows.filter(isRowRetryable).map(({ name, version }) => ({ name, version }));
        if (inputs.length === 0) {
            return;
        }
        const fetchToken = latestFetchByEntry.get(toRaw(entry));
        isRetrying.value = true;
        // The entry's snapshot may hold hidden columns too; retried rows must keep them.
        const retried = await fetchPackagesInfo(inputs, {
            visibleColumns: new Set(entry.visibleColumnsSnapshot ?? visibleColumns.value),
        });
        isRetrying.value = false;
        const isStillWanted =
            isCurrentEntry(entry) && latestFetchByEntry.get(toRaw(entry)) === fetchToken;
        if (!retried || !isStillWanted) {
            return;
        }
        entry.deps = replaceRows(entry.deps, retried);
        entry.devDeps = replaceRows(entry.devDeps, retried);
        deps.value = entry.deps;
        devDeps.value = entry.devDeps;
    }

    /**
     * Current entry's rows of `list` holding every column in `columns`; null
     * once the entry changed. Cached rows that cover `columns` come back
     * without a fetch; else only lookups missing from the memo caches hit the
     * network. Leaves `deps`, `devDeps` and the entry cache untouched, so the
     * tables neither reload nor change.
     */
    async function fetchRowsWithColumns(
        list: DependencyListId,
        columns: ReadonlySet<string>,
    ): Promise<DependencyRow[] | null> {
        const entry = history.value[historyIndex.value];
        if (!entry) {
            return null;
        }
        if (entryCoversColumns(entry, columns)) {
            return entry[list];
        }
        const dependencies = list === "deps" ? entry.pkg.dependencies : entry.pkg.devDependencies;
        const rows = await fetchPackagesInfo(toPackageInputs(dependencies), {
            visibleColumns: new Set(columns),
            isCancelled: () => !isCurrentEntry(entry),
        });
        return isCurrentEntry(entry) ? rows : null;
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
        // Lookups still in flight went out without the token; the refetch must not share them.
        clearPackageInfoCache();
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
            applyCurrentHistoryEntry(true);
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
        pendingColumns,
        loadError,
        history,
        historyIndex,
        canGoBack,
        canGoForward,
        goBack,
        goForward,
        loadPackageJsonText,
        isRetrying,
        retryFailedRows,
        fetchedColumns,
        fetchRowsWithColumns,
    };
}
