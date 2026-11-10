import { computed, defineComponent, onBeforeUnmount, ref, watch } from "vue";
import { t } from "../../core/i18n";
import { NETWORK_BADGE_HIDE_DELAY_MS } from "../constants";
import { networkLogBatch, networkLogBatchCount, networkLogBatchSummary } from "../utils/networkLog";
import type { NetworkLogState } from "../utils/networkLog";
import IconCross from "./IconCross.vue";
import { STATE_ICONS } from "./networkStateIcons";

/** Order of bar segments and counts. */
const BADGE_STATES: NetworkLogState[] = ["success", "failure", "pending"];

/**
 * Bottom-right popup for the current request batch: segmented bar and
 * counts per state. Shows when a batch starts, hides NETWORK_BADGE_HIDE_DELAY_MS
 * after it settles without failures; failures keep it until dismissed. A
 * failure after auto-hide, e.g. a body breaking off, shows it again.
 * Click emits `open`.
 */
export default defineComponent({
    components: { IconCross },
    emits: ["open"],
    setup() {
        const isVisible = ref(networkLogBatch.length > 0);
        /** Dismissed by the user during the current batch. */
        let isDismissed = false;
        const summary = networkLogBatchSummary;
        const openLabel = computed(() =>
            t("networkBadge.open", { summary: t("networkLog.summary", summary.value) }),
        );
        let hideTimer: ReturnType<typeof setTimeout> | undefined;
        function hide() {
            clearTimeout(hideTimer);
            isVisible.value = false;
        }
        function dismiss() {
            isDismissed = true;
            hide();
        }
        function segmentWidth(state: NetworkLogState): string {
            return `${(summary.value[state] / summary.value.total) * 100}%`;
        }
        watch(networkLogBatchCount, () => {
            clearTimeout(hideTimer);
            isDismissed = false;
            isVisible.value = true;
        });
        watch(
            summary,
            ({ total, pending, failure }) => {
                clearTimeout(hideTimer);
                if (failure > 0 && !isDismissed) {
                    isVisible.value = true;
                }
                if (total === 0 || pending > 0 || failure > 0) {
                    return;
                }
                hideTimer = setTimeout(hide, NETWORK_BADGE_HIDE_DELAY_MS);
            },
            { immediate: true },
        );
        onBeforeUnmount(() => clearTimeout(hideTimer));
        return {
            t,
            BADGE_STATES,
            STATE_ICONS,
            isVisible,
            summary,
            openLabel,
            dismiss,
            segmentWidth,
        };
    },
});
