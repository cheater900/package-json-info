import { ref, defineComponent } from "vue";
import type { PropType } from "vue";
import { t } from "../i18n";
import { EXPORTERS } from "../utils/export";
import { downloadBlob } from "../utils/export/download";
import type { ExportDocument, Exporter } from "../utils/export/types";

/** One button per registered export format; a click saves `document` in that format. */
export default defineComponent({
    props: {
        document: {
            type: Object as PropType<ExportDocument>,
            required: true,
        },
        /** File name without extension. */
        fileBaseName: {
            type: String,
            required: true,
        },
        disabled: {
            type: Boolean,
            default: false,
        },
    },
    setup(props) {
        const hasFailed = ref(false);
        // One export at a time: a double click must not save the file twice.
        const isExporting = ref(false);

        // A sync render (PDF of a big table) blocks the page; clicks made meanwhile
        // queue up and run after it. Unlock after them, in a later task.
        function unlockAfterQueuedClicks() {
            setTimeout(() => {
                isExporting.value = false;
            });
        }

        // Format libraries can fail on input or browser limits beyond this app's control.
        async function exportAs(exporter: Exporter) {
            if (isExporting.value) {
                return;
            }
            isExporting.value = true;
            hasFailed.value = false;
            try {
                const blob = await exporter.render(props.document);
                downloadBlob(blob, `${props.fileBaseName}.${exporter.extension}`);
            } catch {
                hasFailed.value = true;
            }
            unlockAfterQueuedClicks();
        }

        return { t, EXPORTERS, hasFailed, isExporting, exportAs };
    },
});
