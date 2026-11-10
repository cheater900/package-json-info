import { ref, computed, watch, defineComponent } from "vue";
import type { PropType } from "vue";
import { t } from "../i18n";
import draggable from "vuedraggable";
import {
    TOGGLEABLE_COLUMNS,
    DEFAULT_COLUMN_ORDER,
    NAME_COLUMN_KEY,
    abbreviateLabel,
} from "../utils/tableColumns";
import type { ColumnDef } from "../utils/tableColumns";
import type { DependencyRow, SortDirection } from "../types";
import { sortDependencies } from "../utils/dependencyRowFormatting";
import Tooltip from "./Tooltip.vue";
import SortIndicator from "./SortIndicator.vue";
import DependencyCell from "./DependencyCell.vue";

const COLUMNS_BY_KEY = new Map(TOGGLEABLE_COLUMNS.map((c) => [c.key, c]));

export default defineComponent({
    components: { draggable, Tooltip, SortIndicator, DependencyCell },
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
    },
    emits: ["load-package", "reorder-columns", "open-source-tree", "select-package"],
    setup(props, { emit }) {
        const filteredDependencies = computed(() => {
            const query = props.searchQuery.trim().toLowerCase();
            if (!query) {
                return props.dependencies;
            }
            return props.dependencies.filter((d) => d.name?.toLowerCase().includes(query));
        });

        function labelFor(col: ColumnDef) {
            return props.shrinkLabels ? abbreviateLabel(col.label) : col.label;
        }

        function titleFor(col: ColumnDef) {
            const label = labelFor(col);
            return label !== col.label ? col.label : undefined;
        }

        // Resolve the parent's ordered list of visible column keys into full
        // ColumnDefs, dropping any key that no longer matches a real column.
        const orderedVisibleColumns = computed(() =>
            props.columns.map((key) => COLUMNS_BY_KEY.get(key)).filter((c) => c !== undefined),
        );

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

        // Cells expanded via click-to-expand (see deps-table__truncate-cell in the
        // template), keyed by "<dependency name>:<column key>" so expansion
        // state is per-cell rather than per-column or per-row.
        const expandedCells = ref(new Set<string>());

        function cellKey(name: string, key: string) {
            return `${name}:${key}`;
        }

        function isExpanded(name: string, key: string) {
            return expandedCells.value.has(cellKey(name, key));
        }

        function toggleExpand(name: string, key: string) {
            const k = cellKey(name, key);
            if (expandedCells.value.has(k)) {
                expandedCells.value.delete(k);
                return;
            }
            expandedCells.value.add(k);
        }

        // Whether a deps-table__truncate-cell <td> is actually clipping its text right
        // now - false once its content fits within the max-width, at which
        // point there's nothing to expand and the hover/cursor affordance
        // should disappear.
        function isOverflowing(el: Element) {
            return el.scrollWidth > el.clientWidth;
        }

        // Recomputed on hover (cheap, and avoids tracking overflow state for
        // every cell up front - most never get hovered).
        function onCellMouseEnter(event: MouseEvent) {
            const el = event.currentTarget as HTMLElement;
            el.classList.toggle("deps-table__truncate-cell--overflowing", isOverflowing(el));
        }

        // An already-expanded cell always collapses on click; a collapsed
        // one only expands if its text is actually being clipped. When
        // neither applies, the click is a no-op here and is left to bubble
        // up to the row's own click handler (open the package summary card)
        // instead of being swallowed.
        function onCellClick(event: MouseEvent, name: string, key: string) {
            if (!isExpanded(name, key) && !isOverflowing(event.currentTarget as HTMLElement)) {
                return;
            }
            event.stopPropagation();
            toggleExpand(name, key);
        }

        return {
            t,
            NAME_COLUMN_KEY,
            labelFor,
            titleFor,
            orderedVisibleColumns,
            draggableColumns,
            toggleSort,
            sortDirectionFor,
            sortedDependencies,
            isExpanded,
            onCellMouseEnter,
            onCellClick,
        };
    },
});
