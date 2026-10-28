import { ref, computed, watch } from "vue";
import {
    toggleColumnVisibility,
    TOGGLEABLE_COLUMNS,
    isColumnVisible,
    orderColumns,
    mergeColumnOrder,
} from "../utils/tableColumns";
import {
    loadVisibleColumns,
    saveVisibleColumns,
    loadColumnOrder,
    saveColumnOrder,
    loadShrinkColumnLabels,
    saveShrinkColumnLabels,
} from "../utils/columnPreferencesStorage";

/**
 * Owns everything about which dependency-table columns are visible, in what
 * order, and how their labels render (full name vs. abbreviated) - each
 * persisted to localStorage on change, and shared globally across the
 * Deps/Dev Deps tables and the Columns panel.
 */
export function useColumnPreferences() {
    const visibleColumns = ref(loadVisibleColumns());
    const columnOrder = ref(loadColumnOrder());
    const shrinkColumnLabels = ref(loadShrinkColumnLabels());
    watch(visibleColumns, saveVisibleColumns, { deep: true });
    watch(columnOrder, saveColumnOrder, { deep: true });
    watch(shrinkColumnLabels, saveShrinkColumnLabels);

    function toggleColumn(key: string) {
        visibleColumns.value = toggleColumnVisibility(visibleColumns.value, key);
    }

    // `newVisibleOrder` is a permutation of just the currently-visible
    // columns (what DependenciesTable emits after a drag) - merge it back
    // into the full persisted order so each hidden column keeps its own
    // slot, ready to reappear in place if it's shown again later.
    function reorderColumns(newVisibleOrder: string[]) {
        columnOrder.value = mergeColumnOrder(columnOrder.value, newVisibleOrder);
    }

    // The currently-visible toggleable column keys, in display order - the
    // only column-visibility/order info DependenciesTable needs. It owns
    // everything else about a column (label, abbreviation, cell rendering).
    const visibleColumnKeys = computed(() =>
        orderColumns(columnOrder.value, TOGGLEABLE_COLUMNS)
            .filter((c) => isColumnVisible(visibleColumns.value, c.key))
            .map((c) => c.key),
    );

    return {
        visibleColumns,
        columnOrder,
        shrinkColumnLabels,
        visibleColumnKeys,
        toggleColumn,
        reorderColumns,
    };
}
