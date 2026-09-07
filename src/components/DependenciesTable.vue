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
                        <span class="th-inner">Load</span>
                    </th>
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
import { ref, computed, watch } from "vue";
import draggable from "vuedraggable";
import {
    isColumnVisible,
    TOGGLEABLE_COLUMNS,
    DEFAULT_COLUMN_ORDER,
    orderColumns,
    mergeColumnOrder,
} from "../utils/tableColumns";
import { formatCell, sortDependencies } from "../utils/dependencyRowFormatting";

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

const sortedDependencies = computed(() =>
    sortDependencies(filteredDependencies.value, sortKey.value, sortDir.value),
);
</script>

<style>
table.deps {
    display: block;
    overflow-x: scroll;
    width: 100%;
}

table th,
table td {
    padding: 8px 12px;
}

table th {
    white-space: nowrap;
}

.th-inner {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
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
</style>
