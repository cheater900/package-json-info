<template>
    <div class="table-controls">
        <label :for="searchInputId">Search by name</label>
        <input
            :id="searchInputId"
            type="text"
            v-model="searchQuery"
            placeholder="Filter by package name"
        />
    </div>
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
                        <button type="button" @click="toggleSort('name')">
                            Name{{ sortIndicator("name") }}
                        </button>
                    </th>
                </template>
                <template #item="{ element: col }">
                    <th>
                        <span class="col-drag-handle" aria-hidden="true"></span>
                        <button v-if="col.sortable" type="button" @click="toggleSort(col.key)">
                            {{ col.label }}{{ sortIndicator(col.key) }}
                        </button>
                        <span v-else>{{ col.label }}</span>
                    </th>
                </template>
                <template #footer>
                    <th>Load</th>
                </template>
            </draggable>
        </thead>
        <tbody>
            <tr v-for="dependency in sortedDependencies" :key="dependency.name">
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
                        Load
                    </button>
                </td>
            </tr>
        </tbody>
    </table>
</template>

<script lang="ts" setup>
import { ref, computed, watch, useId } from "vue";
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
});

const emit = defineEmits(["load-package", "reorder-columns"]);

const searchInputId = useId();
const searchQuery = ref("");

const filteredDependencies = computed(() => {
    const query = searchQuery.value.trim().toLowerCase();
    if (!query) return props.dependencies;
    return props.dependencies.filter((d) => d.name?.toLowerCase().includes(query));
});

function isVisible(key) {
    return isColumnVisible(props.visibleColumns, key);
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

function sortIndicator(key) {
    if (sortKey.value !== key) return "";
    return sortDir.value === "asc" ? " ▲" : " ▼";
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
        return new Date(dateStr).toDateString();
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

// Per-column cell formatters, keyed by column key. Columns without an entry
// here fall back to a plain value ?? "-" passthrough (see formatCell).
// sourceCode isn't included: it renders a link instead of text, and is
// special-cased directly in the template.
const CELL_FORMATTERS = {
    versionDate: (d) => fmtDate(d.versionDate),
    latestReleaseDate: (d) => fmtDate(d.latestReleaseDate),
    latestUpdateDate: (d) => fmtDate(d.latestUpdateDate),
    isOutdated: (d) => fmtOutdated(d.isOutdated),
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
.table-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}

table.deps {
    display: block;
    overflow-x: scroll;
    width: 100%;
}

table th,
table td {
    padding: 8px 12px;
}

.col-drag-handle {
    display: inline-block;
    cursor: grab;
    padding: 0 4px;
}

.col-drag-handle::before {
    content: "⠿";
}
</style>
