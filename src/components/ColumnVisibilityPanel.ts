import { computed, defineComponent } from "vue";
import { t } from "../i18n";
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
            t,
            toggleableColumns,
            wouldViolateMinVisible,
        };
    },
});
