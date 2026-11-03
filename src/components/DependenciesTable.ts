import { ref, computed, watch, defineComponent } from "vue";
import type { PropType } from "vue";
import { t } from "../i18n";
import draggable from "vuedraggable";
import { DEFAULT_COLUMN_ORDER, NAME_COLUMN_KEY, toggleableColumnsFor } from "../utils/tableColumns";
import type { ColumnDef } from "../utils/tableColumns";
import type { DependencyRow, SortDirection } from "../types";
import { filterRowsByName, fmtStaleNote, sortDependencies } from "../utils/dependencyRowFormatting";
import { isRowRetryable } from "../utils/packageJsonHistory";
import Tooltip from "./Tooltip.vue";
import SortIndicator from "./SortIndicator.vue";
import DependencyCell from "./DependencyCell.vue";
import IconEye from "./IconEye.vue";
import IconGrip from "./IconGrip.vue";
import IconMagnifier from "./IconMagnifier.vue";
import IconReload from "./IconReload.vue";
import TextWrapped from "./TextWrapped.vue";

export default defineComponent({
    components: {
        draggable,
        Tooltip,
        SortIndicator,
        DependencyCell,
        IconEye,
        IconGrip,
        IconMagnifier,
        IconReload,
        TextWrapped,
    },
    props: {
        dependencies: {
            type: Array as PropType<DependencyRow[]>,
            required: true,
        },
        /** Visible column keys in display order. Labels and cell rendering stay in this component. */
        columns: {
            type: Array as PropType<readonly string[]>,
            default: () => DEFAULT_COLUMN_ORDER,
        },
        searchQuery: {
            type: String,
            default: "",
        },
        /** Abbreviate multi-word labels ("Version Date" -> "VD"); the full label shows as a tooltip. */
        shrinkLabels: {
            type: Boolean,
            default: false,
        },
        isLoading: {
            type: Boolean,
            default: false,
        },
        /** True while a retry runs; disables every row's reload button. */
        isRetrying: {
            type: Boolean,
            default: false,
        },
        /** Column keys whose data is loading; their cells show a loading icon over the old rows. */
        pendingColumns: {
            type: Set as PropType<ReadonlySet<string>>,
            default: () => new Set(),
        },
    },
    emits: ["load-package", "reorder-columns", "open-source-tree", "select-package", "retry-row"],
    setup(props, { emit }) {
        const filteredDependencies = computed(() =>
            filterRowsByName(props.dependencies, props.searchQuery),
        );

        function labelFor(col: ColumnDef) {
            return props.shrinkLabels ? col.abbreviation : col.label;
        }

        function titleFor(col: ColumnDef) {
            const label = labelFor(col);
            return label !== col.label ? col.label : undefined;
        }

        const orderedVisibleColumns = computed(() => toggleableColumnsFor(props.columns));

        // vuedraggable needs a locally-mutable array to splice as the user drags -
        // it can't splice a computed or a prop directly. Kept in sync with the true
        // (prop-driven) order via the watchers below.
        const draggableColumns = ref([...orderedVisibleColumns.value]);

        function sameKeyOrder(a: ColumnDef[], b: ColumnDef[]) {
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

        // After a drop, emit the new visible-column order upward. deep: true
        // because vuedraggable mutates draggableColumns in place via splice,
        // which a shallow watch would miss. Merging this back into the full
        // persisted order (so hidden columns keep their own slot) is the
        // parent's job, not this component's.
        watch(
            draggableColumns,
            (cols) => {
                const newOrder = cols.map((c) => c.key);
                if (newOrder.join() !== props.columns.join()) {
                    emit("reorder-columns", newOrder);
                }
            },
            { deep: true },
        );

        const sortKey = ref<string | null>(null);
        const sortDir = ref<SortDirection>("asc");

        function toggleSort(key: string) {
            if (sortKey.value === key) {
                sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
                return;
            }
            sortKey.value = key;
            sortDir.value = "asc";
        }

        function sortDirectionFor(key: string) {
            return sortKey.value === key ? sortDir.value : null;
        }

        const sortedDependencies = computed(() =>
            sortDependencies(filteredDependencies.value, sortKey.value, sortDir.value),
        );

        function staleNoteFor(row: DependencyRow) {
            return "error" in row ? "" : fmtStaleNote(row.staleSince);
        }

        return {
            t,
            NAME_COLUMN_KEY,
            staleNoteFor,
            isRowRetryable,
            labelFor,
            titleFor,
            orderedVisibleColumns,
            draggableColumns,
            toggleSort,
            sortDirectionFor,
            sortedDependencies,
        };
    },
});
