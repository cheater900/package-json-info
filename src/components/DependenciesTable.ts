import { ref, computed, watch, onMounted, onUnmounted, defineComponent } from "vue";
import draggable from "vuedraggable";
import {
    isColumnVisible,
    TOGGLEABLE_COLUMNS,
    DEFAULT_COLUMN_ORDER,
    orderColumns,
    mergeColumnOrder,
} from "../utils/tableColumns";
import { formatCell, sortDependencies } from "../utils/dependencyRowFormatting";

export default defineComponent({
    components: { draggable },
    props: {
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
        // Column keys whose header and cells should be center-aligned instead of
        // the default left alignment.
        centeredColumns: {
            type: Set,
            default: () => new Set(["loadAction"]),
        },
    },
    emits: ["load-package", "reorder-columns"],
    setup(props, { emit }) {
        function isCentered(key) {
            return props.centeredColumns.has(key);
        }

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

        const isExpanded = ref(false);

        function toggleExpanded() {
            isExpanded.value = !isExpanded.value;
        }

        // Clicking the backdrop (not the panel itself) closes the modal, same
        // as pressing Escape.
        function onOverlayClick(event) {
            if (isExpanded.value && event.target === event.currentTarget) {
                isExpanded.value = false;
            }
        }

        function onKeydown(event) {
            if (event.key === "Escape" && isExpanded.value) {
                isExpanded.value = false;
            }
        }

        // Lock page scroll behind the fullscreen overlay while it's open.
        watch(isExpanded, (expanded) => {
            document.body.style.overflow = expanded ? "hidden" : "";
        });

        onMounted(() => window.addEventListener("keydown", onKeydown));
        onUnmounted(() => {
            window.removeEventListener("keydown", onKeydown);
            document.body.style.overflow = "";
        });

        return {
            isCentered,
            formatCell,
            isVisible,
            labelFor,
            titleFor,
            orderedVisibleColumns,
            draggableColumns,
            toggleSort,
            sortDirectionFor,
            sortedDependencies,
            isExpanded,
            toggleExpanded,
            onOverlayClick,
        };
    },
});
