import { ref, computed, watch } from "vue";
import {
    toggleColumnVisibility,
    TOGGLEABLE_COLUMNS,
    abbreviateLabel,
} from "../utils/tableColumns.ts";
import {
    loadVisibleColumns,
    saveVisibleColumns,
    loadColumnOrder,
    saveColumnOrder,
    loadShrinkColumnLabels,
    saveShrinkColumnLabels,
} from "../utils/columnPreferencesStorage.ts";

/**
 * Owns everything about which dependency-table columns are visible, in what
 * order, and how their labels render (full name vs. abbreviated) - each
 * persisted to localStorage on change, and shared globally across the
 * Deps/Dev Deps tables and the Columns panel.
 */
export function useColumnPreferences() {
    const visibleColumns = ref(loadVisibleColumns());

    watch(
        visibleColumns,
        (value) => {
            saveVisibleColumns(value);
        },
        { deep: true },
    );

    const columnOrder = ref(loadColumnOrder());

    watch(
        columnOrder,
        (value) => {
            saveColumnOrder(value);
        },
        { deep: true },
    );

    const shrinkColumnLabels = ref(loadShrinkColumnLabels());

    watch(shrinkColumnLabels, (value) => {
        saveShrinkColumnLabels(value);
    });

    function toggleColumn(key) {
        visibleColumns.value = toggleColumnVisibility(visibleColumns.value, key);
    }

    function reorderColumns(newOrder) {
        columnOrder.value = newOrder;
    }

    // The label (and, when abbreviated, a full-name tooltip) to show for
    // each toggleable column, keyed by column key. DependenciesTable just
    // renders whatever it's given here - it has no notion of "shrink
    // columns by abbreviation" itself.
    const columnLabels = computed(() => {
        const labels = {};
        for (const col of TOGGLEABLE_COLUMNS) {
            labels[col.key] = shrinkColumnLabels.value ? abbreviateLabel(col.label) : col.label;
        }
        return labels;
    });

    const columnTitles = computed(() => {
        const titles = {};
        for (const col of TOGGLEABLE_COLUMNS) {
            if (columnLabels.value[col.key] !== col.label) {
                titles[col.key] = col.label;
            }
        }
        return titles;
    });

    return {
        visibleColumns,
        columnOrder,
        shrinkColumnLabels,
        columnLabels,
        columnTitles,
        toggleColumn,
        reorderColumns,
    };
}
