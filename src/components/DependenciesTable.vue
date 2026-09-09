<template>
    <table class="deps">
        <thead>
            <draggable
                tag="tr"
                :list="draggableColumns"
                item-key="key"
                handle=".col-drag-handle"
                :force-fallback="true"
            >
                <template #header>
                    <th>
                        <span class="th-inner">
                            <button type="button" class="sort-trigger" @click="toggleSort('name')">
                                <span class="col-label">Name</span>
                                <span class="sort-icons" aria-hidden="true">
                                    <span
                                        class="sort-arrow"
                                        :class="{
                                            'sort-arrow-active': sortDirectionFor('name') === 'asc',
                                        }"
                                    >
                                        ▲
                                    </span>
                                    <span
                                        class="sort-arrow"
                                        :class="{
                                            'sort-arrow-active':
                                                sortDirectionFor('name') === 'desc',
                                        }"
                                    >
                                        ▼
                                    </span>
                                </span>
                            </button>
                        </span>
                    </th>
                </template>
                <template #item="{ element: col }">
                    <th>
                        <span class="th-inner">
                            <span class="col-drag-handle" aria-hidden="true"></span>
                            <button
                                v-if="col.sortable"
                                type="button"
                                class="sort-trigger"
                                @click="toggleSort(col.key)"
                            >
                                <span class="col-label" :title="titleFor(col)">
                                    {{ labelFor(col) }}
                                </span>
                                <span class="sort-icons" aria-hidden="true">
                                    <span
                                        class="sort-arrow"
                                        :class="{
                                            'sort-arrow-active':
                                                sortDirectionFor(col.key) === 'asc',
                                        }"
                                    >
                                        ▲
                                    </span>
                                    <span
                                        class="sort-arrow"
                                        :class="{
                                            'sort-arrow-active':
                                                sortDirectionFor(col.key) === 'desc',
                                        }"
                                    >
                                        ▼
                                    </span>
                                </span>
                            </button>
                            <span v-else class="col-label" :title="titleFor(col)">
                                {{ labelFor(col) }}
                            </span>
                        </span>
                    </th>
                </template>
                <template #footer>
                    <th>
                        <span class="th-inner">Actions</span>
                    </th>
                </template>
            </draggable>
        </thead>
        <tbody>
            <tr v-if="isLoading">
                <td :colspan="orderedVisibleColumns.length + 2" class="loading-row">Loading…</td>
            </tr>
            <tr v-else v-for="dependency in sortedDependencies" :key="dependency.name">
                <td>{{ dependency.name }}</td>
                <td v-for="col in orderedVisibleColumns" :key="col.key">
                    <template v-if="col.key === 'sourceCode'">
                        <a v-if="dependency.sourceCode" :href="dependency.sourceCode">link</a>
                        <template v-else>-</template>
                    </template>
                    <template v-else>{{ formatCell(col.key, dependency) }}</template>
                </td>
                <td>
                    <button
                        type="button"
                        @click="
                            $emit('load-package', {
                                name: dependency.name,
                                version: dependency.version,
                            })
                        "
                    >
                        VIEW THIS
                    </button>
                </td>
            </tr>
        </tbody>
    </table>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from "vue";
import draggable from "vuedraggable";
import { hasLicenseWarning } from "../utils/license";
import {
    isColumnVisible,
    TOGGLEABLE_COLUMNS,
    DEFAULT_COLUMN_ORDER,
    orderColumns,
    mergeColumnOrder,
} from "../utils/tableColumns";

const props = defineProps({
    dependencies: {
        type: Array,
        required: true,
    },
    visibleColumns: {
        type: Set,
        default: () => new Set(TOGGLEABLE_COLUMNS.map((c) => c.key)),
    },
    columnOrder: {
        type: Array,
        default: () => DEFAULT_COLUMN_ORDER,
    },
    searchQuery: {
        type: String,
        default: "",
    },
    // Display label per column key, decided entirely by the parent (e.g.
    // full name vs. an abbreviation) - this component has no opinion on it,
    // it just renders whatever it's given, falling back to the column's own
    // default label for any key the parent doesn't override.
    columnLabels: {
        type: Object,
        default: () => ({}),
    },
    // Tooltip text per column key, shown on hover. Only columns whose label
    // is being overridden with something other than its full name need an
    // entry here (e.g. an abbreviation's real name) - the parent decides.
    columnTitles: {
        type: Object,
        default: () => ({}),
    },
    isLoading: {
        type: Boolean,
        default: false,
    },
});

const emit = defineEmits(["load-package", "reorder-columns"]);

const filteredDependencies = computed(() => {
    const query = props.searchQuery.trim().toLowerCase();
    if (!query) return props.dependencies;
    return props.dependencies.filter((d) => d.name?.toLowerCase().includes(query));
});

function isVisible(key) {
    return isColumnVisible(props.visibleColumns, key);
}

function labelFor(col) {
    return props.columnLabels[col.key] ?? col.label;
}

function titleFor(col) {
    return props.columnTitles[col.key];
}

// The currently-visible toggleable columns, in the persisted order.
const orderedVisibleColumns = computed(() =>
    orderColumns(props.columnOrder, TOGGLEABLE_COLUMNS).filter((c) => isVisible(c.key)),
);

// vuedraggable needs a locally-mutable array to splice as the user drags -
// it can't splice a computed or a prop directly. Kept in sync with the true
// (prop-driven) order via the watchers below.
const draggableColumns = ref([...orderedVisibleColumns.value]);

function sameKeyOrder(a, b) {
    return a.length === b.length && a.every((col, i) => col.key === b[i].key);
}

// Resync when the true order/visibility changes for a reason other than a
// drag on this table instance - a column was hidden/shown, or the sibling
// Deps/Dev Deps table reordered columns and it flowed back down through the
// shared App-level state.
watch(orderedVisibleColumns, (next) => {
    if (!sameKeyOrder(draggableColumns.value, next)) {
        draggableColumns.value = [...next];
    }
});

// After a drop, merge the new visible-column order into the full persisted
// order and emit it upward. deep: true because vuedraggable mutates
// draggableColumns in place via splice, which a shallow watch would miss.
watch(
    draggableColumns,
    (cols) => {
        const merged = mergeColumnOrder(
            props.columnOrder,
            cols.map((c) => c.key),
        );
        if (merged.join() !== props.columnOrder.join()) {
            emit("reorder-columns", merged);
        }
    },
    { deep: true },
);

// Columns whose values are meaningful to sort by (excludes the source-code
// link, the raw semver ranges, and list-valued columns).
const SORT_ACCESSORS = {
    name: (d) => d.name,
    versionDate: (d) => d.versionDate,
    latestReleaseDate: (d) => d.latestReleaseDate,
    latestUpdateDate: (d) => d.latestUpdateDate,
    isOutdated: (d) => d.isOutdated,
    weeklyDownloads: (d) => d.weeklyDownloads,
    gitStars: (d) => d.gitStars,
    openPRs: (d) => d.openPRs,
    closedPRs: (d) => d.closedPRs,
    openIssues: (d) => d.openIssues,
    closedIssues: (d) => d.closedIssues,
    vulnerabilityCount: (d) => d.vulnerabilityCount,
    bundleSizeGzip: (d) => d.bundleSizeGzip,
};

const sortKey = ref(null);
const sortDir = ref("asc");

function toggleSort(key) {
    if (sortKey.value === key) {
        sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
    } else {
        sortKey.value = key;
        sortDir.value = "asc";
    }
}

function sortDirectionFor(key) {
    return sortKey.value === key ? sortDir.value : null;
}

/** Missing values always sort last, regardless of direction. */
function compareValues(a, b, dir) {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;
    const cmp = typeof a === "string" ? a.localeCompare(b) : a < b ? -1 : a > b ? 1 : 0;
    return dir === "desc" ? -cmp : cmp;
}

const sortedDependencies = computed(() => {
    if (!sortKey.value) return filteredDependencies.value;
    const accessor = SORT_ACCESSORS[sortKey.value];
    return [...filteredDependencies.value].sort((a, b) =>
        compareValues(accessor(a), accessor(b), sortDir.value),
    );
});

function fmtDate(dateStr) {
    if (!dateStr) return "-";
    try {
        return new Date(dateStr).toDateString().slice(4);
    } catch {
        return dateStr;
    }
}

function fmtList(names) {
    if (!names || names.length === 0) return "-";
    return names.join(", ");
}

function fmtOutdated(isOutdated) {
    if (isOutdated === null || isOutdated === undefined) return "-";
    return isOutdated ? "Yes" : "No";
}

function fmtLicense(license) {
    const label = license ?? "-";
    return hasLicenseWarning(license) ? `${label} ⚠` : label;
}

function fmtBundleSize(gzipBytes) {
    if (gzipBytes === null || gzipBytes === undefined) return "-";
    return `${(gzipBytes / 1024).toFixed(1)} KB`;
}

function fmtNumber(n) {
    if (n === null || n === undefined) return "-";
    return n.toLocaleString("en-US");
}

// Per-column cell formatters, keyed by column key. Columns without an entry
// here fall back to a plain value ?? "-" passthrough (see formatCell).
// sourceCode isn't included: it renders a link instead of text, and is
// special-cased directly in the template.
const CELL_FORMATTERS = {
    versionDate: (d) => fmtDate(d.versionDate),
    latestReleaseDate: (d) => fmtDate(d.latestReleaseDate),
    latestUpdateDate: (d) => fmtDate(d.latestUpdateDate),
    isOutdated: (d) => fmtOutdated(d.isOutdated),
    weeklyDownloads: (d) => fmtNumber(d.weeklyDownloads),
    gitStars: (d) => fmtNumber(d.gitStars),
    openPRs: (d) => fmtNumber(d.openPRs),
    closedPRs: (d) => fmtNumber(d.closedPRs),
    openIssues: (d) => fmtNumber(d.openIssues),
    closedIssues: (d) => fmtNumber(d.closedIssues),
    vulnerabilityCount: (d) => fmtNumber(d.vulnerabilityCount),
    dependencies: (d) => fmtList(d.dependencies),
    license: (d) => fmtLicense(d.license),
    bundleSizeGzip: (d) => fmtBundleSize(d.bundleSizeGzip),
    maintainers: (d) => fmtList(d.maintainers),
};

function formatCell(key, dependency) {
    const formatter = CELL_FORMATTERS[key];
    return formatter ? formatter(dependency) : (dependency[key] ?? "-");
}
</script>

<style>
table.deps {
    display: block;
    overflow-x: scroll;
    width: 100%;
    font-size: 0.85rem;
    margin-top: 4px;
}

table th,
table td {
    padding: 6px 10px;
    white-space: nowrap;
}

table td button {
    font-size: inherit;
}

.th-inner {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    font-weight: 600;
}

.col-drag-handle {
    display: inline-block;
    cursor: grab;
    padding: 0 4px;
}

.col-drag-handle::before {
    content: "⠿";
}

.sort-trigger {
    all: unset;
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    cursor: pointer;
    font: inherit;
    color: inherit;
}

.sort-icons {
    display: inline-flex;
    flex-direction: column;
    justify-content: center;
    line-height: 0.6;
    font-size: 0.7em;
}

.sort-arrow {
    opacity: 0.35;
}

.sort-arrow-active {
    opacity: 1;
    font-weight: bold;
}

.loading-row {
    text-align: center;
    font-style: italic;
    padding: 12px;
}
</style>
