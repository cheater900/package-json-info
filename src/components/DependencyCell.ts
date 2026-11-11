import { computed, defineComponent } from "vue";
import { t } from "../i18n";
import { fmtList, formatCell } from "../utils/dependencyRowFormatting";
import { healthBand } from "../utils/healthScore";
import { MISSING_VALUE } from "../constants";
import Tooltip from "./Tooltip.vue";

/** One dependency value rendered per its column's `render` kind: link, button, health score, or formatted text. */
export default defineComponent({
    components: { Tooltip },
    props: {
        column: {
            type: Object,
            required: true,
        },
        dependency: {
            type: Object,
            required: true,
        },
    },
    emits: ["open-source-tree"],
    setup(props) {
        const healthTooltip = computed(() => {
            const signalKeys: string[] = props.dependency.healthSignals ?? [];
            const signals = fmtList(signalKeys.map((key) => t(`health.signals.${key}`)));
            return t("health.tooltip", { signals });
        });
        return { t, formatCell, healthBand, healthTooltip, MISSING_VALUE };
    },
});
