import { computed, defineComponent } from "vue";
import {
    TOGGLEABLE_COLUMNS,
    DEFAULT_COLUMN_ORDER,
    wouldViolateMinVisible,
    orderColumns,
} from "../utils/tableColumns";

export default defineComponent({
    props: {
        visibleColumns: {
            type: Set,
            required: true,
        },
        columnOrder: {
            type: Array,
            default: () => DEFAULT_COLUMN_ORDER,
        },
    },
    emits: ["toggle-column"],
    setup(props) {
        const toggleableColumns = computed(() =>
            orderColumns(props.columnOrder, TOGGLEABLE_COLUMNS),
        );

        return {
            toggleableColumns,
            wouldViolateMinVisible,
        };
    },
});
