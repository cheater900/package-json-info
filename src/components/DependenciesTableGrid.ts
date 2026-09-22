import { defineComponent } from "vue";
import draggable from "vuedraggable";
import Tooltip from "./Tooltip.vue";

// Purely presentational: renders one <table> + its loading/empty status
// message from data and callbacks the parent owns. Exists so
// DependenciesTable can mount two independent copies (inline, and one
// inside the fullscreen Modal) off a single shared state, rather than
// teleporting one live copy back and forth between the two spots - which is
// what broke this table's tooltips before.
export default defineComponent({
    components: { draggable, Tooltip },
    props: {
        orderedVisibleColumns: {
            type: Array,
            required: true,
        },
        // Same array reference as the parent's ref - vuedraggable splices it
        // in place, and each grid instance dragging its own copy of this
        // table's header row stays in sync because they all share it.
        draggableColumns: {
            type: Array,
            required: true,
        },
        sortedDependencies: {
            type: Array,
            required: true,
        },
        isLoading: {
            type: Boolean,
            default: false,
        },
        isEmpty: {
            type: Boolean,
            default: false,
        },
        isCentered: {
            type: Function,
            required: true,
        },
        labelFor: {
            type: Function,
            required: true,
        },
        titleFor: {
            type: Function,
            required: true,
        },
        sortDirectionFor: {
            type: Function,
            required: true,
        },
        formatCell: {
            type: Function,
            required: true,
        },
    },
    emits: ["toggle-sort", "open-source-tree", "load-package"],
});
