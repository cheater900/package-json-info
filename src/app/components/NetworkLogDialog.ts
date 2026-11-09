import { computed, defineComponent } from "vue";
import { MISSING_VALUE, NUMBER_LOCALE } from "../../core/constants";
import { t } from "../../core/i18n";
import { formatByteSize } from "../../core/utils/bytes";
import { fmtList } from "../../core/utils/dependencyRowFormatting";
import { networkLogEntries, networkLogSummary } from "../utils/networkLog";
import type { NetworkLogEntry, NetworkLogState } from "../utils/networkLog";
import IconCheck from "./IconCheck.vue";
import IconCross from "./IconCross.vue";
import IconQuestion from "./IconQuestion.vue";
import IconReload from "./IconReload.vue";
import TextWrapped from "./TextWrapped.vue";

const HEADERS = [
    "state",
    "time",
    "request",
    "package",
    "dependencies",
    "columns",
    "status",
    "size",
    "actions",
];

/** Characters of method and URL shown before the request cell clips. */
const URL_MAX_LENGTH = 80;

const STATE_ICONS: Record<NetworkLogState, typeof IconCheck> = {
    pending: IconQuestion,
    success: IconCheck,
    failure: IconCross,
};

function formatTime(startedAt: number): string {
    return new Date(startedAt).toLocaleTimeString(NUMBER_LOCALE);
}

function formatDependencies(entry: NetworkLogEntry): string {
    return fmtList([...(entry.subject?.dependencies ?? [])]);
}

function formatColumns(entry: NetworkLogEntry): string {
    return fmtList([...(entry.subject?.columns ?? [])].map((key) => t(`columns.${key}`)));
}

function formatSize(entry: NetworkLogEntry): string {
    return entry.sizeBytes === null ? MISSING_VALUE : formatByteSize(entry.sizeBytes);
}

/**
 * Modal content listing every logged request, newest first, with a
 * summary line. Failed rows get a retry button emitting `retry`.
 */
export default defineComponent({
    components: { IconReload, TextWrapped },
    emits: ["retry"],
    setup() {
        const entries = computed(() => [...networkLogEntries].reverse());
        const summary = computed(() => t("networkLog.summary", networkLogSummary.value));
        return {
            t,
            MISSING_VALUE,
            headers: HEADERS,
            STATE_ICONS,
            URL_MAX_LENGTH,
            entries,
            summary,
            formatTime,
            formatDependencies,
            formatColumns,
            formatSize,
        };
    },
});
