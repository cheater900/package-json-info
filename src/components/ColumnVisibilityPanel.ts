import { computed, defineComponent } from "vue";
import type { PropType } from "vue";
import { t } from "../i18n";
import { COLUMN_ICONS } from "./columnIcons";
import {
    TOGGLEABLE_COLUMNS,
    DEFAULT_COLUMN_ORDER,
    wouldViolateMinVisible,
    orderColumns,
} from "../utils/tableColumns";

export default defineComponent({
    props: {
        visibleColumns: {
            type: Set as PropType<ReadonlySet<string>>,
            required: true,
        },
        columnOrder: {
            type: Array as PropType<readonly string[]>,
            default: () => DEFAULT_COLUMN_ORDER,
        },
    },
    emits: ["toggle-column"],
    setup(props) {
        const toggleableColumns = computed(() =>
            orderColumns(props.columnOrder, TOGGLEABLE_COLUMNS),
        );

        return {
            COLUMN_ICONS,
            t,
            toggleableColumns,
            wouldViolateMinVisible,
        };
    },
});
