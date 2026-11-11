import { computed, defineComponent } from "vue";
import { t } from "../i18n";
import { fmtStaleNote } from "../utils/dependencyRowFormatting";
import { isRowRetryable } from "../utils/packageJsonHistory";
import { TOGGLEABLE_COLUMNS } from "../utils/tableColumns";
import type { DependencyRow } from "../types";
import DependencyCell from "./DependencyCell.vue";

export default defineComponent({
    components: { DependencyCell },
    props: {
        dependency: {
            type: Object,
            required: true,
        },
        /** True while this row's retry is in flight; disables the retry button. */
        isRetrying: {
            type: Boolean,
            default: false,
        },
    },
    emits: ["open-source-tree", "retry-package"],
    setup(props) {
        const canRetry = computed(() => isRowRetryable(props.dependency as DependencyRow));
        // Every column but Name (already shown as the card's title) - the
        // same set DependenciesTable renders, so the card always mirrors
        // whatever columns exist without a second list to keep in sync.
        return {
            t,
            fmtStaleNote,
            canRetry,
            summaryColumns: TOGGLEABLE_COLUMNS,
        };
    },
});
