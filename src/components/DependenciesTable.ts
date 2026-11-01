import { ref, computed, watch, defineComponent } from "vue";
import { t } from "../i18n";
import draggable from "vuedraggable";
import {
    TOGGLEABLE_COLUMNS,
    DEFAULT_COLUMN_ORDER,
    NAME_COLUMN_KEY,
    abbreviateLabel,
} from "../utils/tableColumns";
import { sortDependencies } from "../utils/dependencyRowFormatting";
import Tooltip from "./Tooltip.vue";
import SortIndicator from "./SortIndicator.vue";
import DependencyCell from "./DependencyCell.vue";

const COLUMNS_BY_KEY = new Map(TOGGLEABLE_COLUMNS.map((c) => [c.key, c]));

export default defineComponent({
    components: { draggable, Tooltip, SortIndicator, DependencyCell },
    props: {
        dependencies: {
            type: Array,
            required: true,
        },
        // Ordered list of the currently-visible column keys - the only
        // column-visibility/order information this component needs from its
        // parent. Column text, abbreviation, and how each column's content
        // renders (plain text, numbers, links, buttons) are this
        // component's own business, not something a parent should decide.
        columns: {
            type: Array,
            default: () => DEFAULT_COLUMN_ORDER,
        },
        searchQuery: {
            type: String,
            default: "",
        },
        // Whether to abbreviate multi-word column labels (e.g. "Version
        // Date" -> "VD"), with the full name shown as a hover tooltip. A
        // plain display-preference toggle - turning it into actual label
        // text is this component's job, via abbreviateLabel.
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

        function labelFor(col) {
            return props.shrinkLabels ? abbreviateLabel(col.label) : col.label;
        }

        function titleFor(col) {
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

        const sortKey = ref(null);
        const sortDir = ref("asc");

        function toggleSort(key) {
            if (sortKey.value === key) {
                sortDir.value = sortDir.value === "asc" ? "desc" : "asc";
                return;
            }
            sortKey.value = key;
            sortDir.value = "asc";
        }

        function sortDirectionFor(key) {
            return sortKey.value === key ? sortDir.value : null;
        }

        const sortedDependencies = computed(() =>
            sortDependencies(filteredDependencies.value, sortKey.value, sortDir.value),
        );

        // Cells expanded via click-to-expand (see deps-table__truncate-cell in the
        // template), keyed by "<dependency name>:<column key>" so expansion
        // state is per-cell rather than per-column or per-row.
        const expandedCells = ref(new Set());

        function cellKey(name, key) {
            return `${name}:${key}`;
        }

        function isExpanded(name, key) {
            return expandedCells.value.has(cellKey(name, key));
        }

        function toggleExpand(name, key) {
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
        function isOverflowing(el) {
            return el.scrollWidth > el.clientWidth;
        }

        // Recomputed on hover (cheap, and avoids tracking overflow state for
        // every cell up front - most never get hovered).
        function onCellMouseEnter(event) {
            const el = event.currentTarget;
            el.classList.toggle("deps-table__truncate-cell--overflowing", isOverflowing(el));
        }

        // An already-expanded cell always collapses on click; a collapsed
        // one only expands if its text is actually being clipped. When
        // neither applies, the click is a no-op here and is left to bubble
        // up to the row's own click handler (open the package summary card)
        // instead of being swallowed.
        function onCellClick(event, name, key) {
            if (!isExpanded(name, key) && !isOverflowing(event.currentTarget)) {
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
