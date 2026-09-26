import { defineComponent } from "vue";
import { TOGGLEABLE_COLUMNS } from "../utils/tableColumns";
import { formatCell } from "../utils/dependencyRowFormatting";

export default defineComponent({
    props: {
        dependency: {
            type: Object,
            required: true,
        },
    },
    emits: ["open-source-tree"],
    setup() {
        // Every column but Name (already shown as the card's title) - the
        // same set DependenciesTable renders, so the card always mirrors
        // whatever columns exist without a second list to keep in sync.
        return {
            summaryColumns: TOGGLEABLE_COLUMNS,
            formatCell,
        };
    },
});
