import { ref, defineComponent } from "vue";
import type { PropType } from "vue";
import { MARKDOWN_MIME_TYPE } from "../../core/export/exporters/markdown";
import { t } from "../../core/i18n";
import { renderReportMarkdown } from "../../core/report/renderMarkdown";
import { renderReportPdf } from "../../core/report/renderPdf";
import type { Report } from "../../core/report/types";
import { useExportLock } from "../composables/useExportLock";
import { downloadBlob } from "../utils/download";
import IconDownload from "./IconDownload.vue";

/** Report level 1 renders as h2: the page title holds the only h1. */
const HEADING_LEVEL_OFFSET = 1;

function headingTag(level: number): string {
    return `h${level + HEADING_LEVEL_OFFSET}`;
}

/**
 * Shows a built report: headings, paragraphs, lists and tables as HTML,
 * text only. Footer buttons save it as Markdown or PDF.
 */
export default defineComponent({
    components: { IconDownload },
    props: {
        report: {
            type: Object as PropType<Report>,
            required: true,
        },
        /** File name without extension. */
        fileBaseName: {
            type: String,
            required: true,
        },
    },
    setup(props) {
        const hasFailed = ref(false);
        const { isExporting, lock, unlockAfterQueuedClicks } = useExportLock();

        function exportMarkdown() {
            hasFailed.value = false;
            const blob = new Blob([renderReportMarkdown(props.report)], {
                type: MARKDOWN_MIME_TYPE,
            });
            downloadBlob(blob, `${props.fileBaseName}.md`);
        }

        // jsPDF can fail on input or browser limits beyond this app's control.
        function exportPdf() {
            if (!lock()) {
                return;
            }
            hasFailed.value = false;
            try {
                downloadBlob(renderReportPdf(props.report), `${props.fileBaseName}.pdf`);
            } catch {
                hasFailed.value = true;
            }
            unlockAfterQueuedClicks();
        }

        return { t, hasFailed, isExporting, headingTag, exportMarkdown, exportPdf };
    },
});
