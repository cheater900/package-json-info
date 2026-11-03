import { computed, defineComponent } from "vue";
import { t } from "../i18n";
import { fmtList, formatCell } from "../utils/dependencyRowFormatting";
import { healthBand } from "../utils/healthScore";
import { hasLicenseWarning } from "../utils/license";
import { FAILED_VALUE, MISSING_VALUE } from "../constants";
import IconWarning from "./IconWarning.vue";
import Tooltip from "./Tooltip.vue";

/**
 * One dependency value rendered per its column's `render` kind: link,
 * button, health score, or formatted text. A failed lookup shows
 * FAILED_VALUE with the error as tooltip instead. A pending cell shows a
 * loading icon while its column's data loads.
 */
export default defineComponent({
    components: { IconWarning, Tooltip },
    props: {
        column: {
            type: Object,
            required: true,
        },
        dependency: {
            type: Object,
            required: true,
        },
        isPending: {
            type: Boolean,
            default: false,
        },
    },
    emits: ["open-source-tree"],
    setup(props) {
        const failedLookupError = computed<string | undefined>(
            () => props.dependency.failedLookups?.[props.column.key],
        );
        const healthTooltip = computed(() => {
            const signalKeys: string[] = props.dependency.healthSignals ?? [];
            const signals = fmtList(signalKeys.map((key) => t(`health.signals.${key}`)));
            return t("health.tooltip", { signals });
        });
        return {
            t,
            formatCell,
            hasLicenseWarning,
            healthBand,
            healthTooltip,
            failedLookupError,
            FAILED_VALUE,
            MISSING_VALUE,
        };
    },
});
