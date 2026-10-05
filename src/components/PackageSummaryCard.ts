import { defineComponent } from "vue";
import { TOGGLEABLE_COLUMNS } from "../utils/tableColumns";
import DependencyCell from "./DependencyCell.vue";

export default defineComponent({
    components: { DependencyCell },
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
        };
    },
});
