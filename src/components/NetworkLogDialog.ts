import { computed, defineComponent } from "vue";
import { MISSING_VALUE, NUMBER_LOCALE } from "../constants";
import { t } from "../i18n";
import { formatByteSize } from "../utils/bytes";
import { networkLogEntries, networkLogSummary } from "../utils/networkLog";
import type { NetworkLogEntry, NetworkLogState } from "../utils/networkLog";
import IconCheck from "./IconCheck.vue";
import IconCross from "./IconCross.vue";
import IconQuestion from "./IconQuestion.vue";
import IconReload from "./IconReload.vue";

const HEADERS = ["state", "time", "request", "packages", "columns", "status", "size", "actions"];

const STATE_ICONS: Record<NetworkLogState, typeof IconCheck> = {
    pending: IconQuestion,
    success: IconCheck,
    failure: IconCross,
};

function formatTime(startedAt: number): string {
    return new Date(startedAt).toLocaleTimeString(NUMBER_LOCALE);
}

function formatPackages(entry: NetworkLogEntry): string {
    const packages = [...(entry.subject?.packages ?? [])];
    return packages.length > 0 ? packages.join(", ") : MISSING_VALUE;
}

function formatColumns(entry: NetworkLogEntry): string {
    const labels = [...(entry.subject?.columns ?? [])].map((key) => t(`columns.${key}`));
    return labels.length > 0 ? labels.join(", ") : MISSING_VALUE;
}

function formatSize(entry: NetworkLogEntry): string {
    return entry.sizeBytes === null ? MISSING_VALUE : formatByteSize(entry.sizeBytes);
}

/**
 * Modal content listing every logged request, newest first, with a
 * summary line. Failed rows get a retry button emitting `retry`.
 */
export default defineComponent({
    components: { IconReload },
    emits: ["retry"],
    setup() {
        const entries = computed(() => [...networkLogEntries].reverse());
        const summary = computed(() => t("networkLog.summary", networkLogSummary.value));
        return {
            t,
            MISSING_VALUE,
            headers: HEADERS,
            STATE_ICONS,
            entries,
            summary,
            formatTime,
            formatPackages,
            formatColumns,
            formatSize,
        };
    },
});
