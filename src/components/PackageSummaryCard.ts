import { defineComponent } from "vue";
import { t } from "../i18n";
import { COLUMN_ICONS } from "./columnIcons";
import { fmtStaleNote } from "../utils/dependencyRowFormatting";
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
            COLUMN_ICONS,
            t,
            fmtStaleNote,
            summaryColumns: TOGGLEABLE_COLUMNS,
        };
    },
});
