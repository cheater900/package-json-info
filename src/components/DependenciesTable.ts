import { ref, computed, watch, defineComponent } from "vue";
import { TOGGLEABLE_COLUMNS, DEFAULT_COLUMN_ORDER, abbreviateLabel } from "../utils/tableColumns";
import { formatCell, sortDependencies } from "../utils/dependencyRowFormatting";
import DependenciesTableGrid from "./DependenciesTableGrid.vue";
import Modal from "./Modal.vue";
import SourceTreeModal from "./SourceTreeModal.vue";

const COLUMNS_BY_KEY = new Map(TOGGLEABLE_COLUMNS.map((c) => [c.key, c]));

export default defineComponent({
    components: { DependenciesTableGrid, Modal, SourceTreeModal },
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
    emits: ["load-package", "reorder-columns"],
    setup(props, { emit }) {
        // The Actions column is the only one center-aligned; not something a
        // parent has ever needed to customize.
        function isCentered(key) {
            return key === "loadAction";
        }

        const filteredDependencies = computed(() => {
            const query = props.searchQuery.trim().toLowerCase();
            if (!query) return props.dependencies;
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
        // (prop-driven) order via the watchers below. Shared by reference with both
        // the inline and expanded-modal grid, so dragging either keeps them in sync.
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

        const isExpanded = ref(false);

        function openExpanded() {
            isExpanded.value = true;
        }

        function closeExpanded() {
            isExpanded.value = false;
        }

        // The dependency whose source tree is currently open in the modal, if
        // any. Kept as the whole row rather than just its sourceTree ref so
        // the modal can show which package/version it's browsing.
        const activeSourceTreeDependency = ref(null);

        function openSourceTree(dependency) {
            activeSourceTreeDependency.value = dependency;
        }

        function closeSourceTree() {
            activeSourceTreeDependency.value = null;
        }

        return {
            isCentered,
            formatCell,
            labelFor,
            titleFor,
            orderedVisibleColumns,
            draggableColumns,
            toggleSort,
            sortDirectionFor,
            sortedDependencies,
            isExpanded,
            openExpanded,
            closeExpanded,
            activeSourceTreeDependency,
            openSourceTree,
            closeSourceTree,
        };
    },
});
