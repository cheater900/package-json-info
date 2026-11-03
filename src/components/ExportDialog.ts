import { ref, shallowRef, computed, watch, defineComponent } from "vue";
import type { PropType } from "vue";
import { t } from "../i18n";
import { EXPORTERS } from "../utils/export";
import { buildExportDocument, exportFileBaseName } from "../utils/export/buildExportDocument";
import type { ExportTableInput } from "../utils/export/buildExportDocument";
import { downloadBlob } from "../utils/export/download";
import { TOGGLEABLE_COLUMNS, orderColumns } from "../utils/tableColumns";
import type { DependencyListId, DependencyRow } from "../types";

export type ExportDialogTable = {
    id: DependencyListId;
    title: string;
};

type LoadRows = (
    list: DependencyListId,
    columns: ReadonlySet<string>,
) => Promise<DependencyRow[] | null>;

/**
 * Export form: pick tables, columns and format, then download. Each pick
 * reloads the chosen tables' rows through `loadRows`, which fetches columns
 * the tables never loaded; Download waits for it. Every row is exported,
 * whatever the table search shows.
 */
export default defineComponent({
    props: {
        tables: {
            type: Array as PropType<ExportDialogTable[]>,
            required: true,
        },
        /** Tables checked when the dialog opens. */
        initialTableIds: {
            type: Array as PropType<readonly DependencyListId[]>,
            required: true,
        },
        /** Full persisted column order, hidden columns included. */
        columnOrder: {
            type: Array as PropType<readonly string[]>,
            required: true,
        },
        /** Columns checked when the dialog opens. */
        initialColumns: {
            type: Array as PropType<readonly string[]>,
            required: true,
        },
        /** Columns the tables already hold data for. */
        fetchedColumns: {
            type: Set as PropType<ReadonlySet<string>>,
            required: true,
        },
        title: {
            type: String,
            required: true,
        },
        /** Rows of one table holding every column in `columns`; null when stale. */
        loadRows: {
            type: Function as PropType<LoadRows>,
            required: true,
        },
    },
    emits: ["close"],
    setup(props, { emit }) {
        // Button columns carry no data. Name is always exported, so it is not listed.
        const columnOptions = computed(() =>
            orderColumns(props.columnOrder, TOGGLEABLE_COLUMNS).filter(
                (c) => c.render !== "button",
            ),
        );
        const selectedTableIds = ref<DependencyListId[]>([...props.initialTableIds]);
        const selectedColumnKeys = ref<string[]>(
            columnOptions.value
                .filter((c) => props.initialColumns.includes(c.key))
                .map((c) => c.key),
        );
        const selectedColumns = computed(() =>
            columnOptions.value.filter((c) => selectedColumnKeys.value.includes(c.key)),
        );
        const formatId = ref(EXPORTERS[0].id);
        // Selected tables with rows for the selected columns; null until loaded.
        const loadedTables = shallowRef<ExportTableInput[] | null>(null);
        const isLoading = ref(false);
        const hasFailed = ref(false);
        // One export at a time: a double click must not save the file twice.
        const isExporting = ref(false);
        // Latest load started. A slower, older load must not overwrite a newer selection.
        let latestLoad = Symbol();
        const canDownload = computed(
            () =>
                selectedTableIds.value.length > 0 &&
                loadedTables.value !== null &&
                !isLoading.value &&
                !isExporting.value,
        );

        function isColumnLoading(key: string) {
            return (
                isLoading.value &&
                selectedColumnKeys.value.includes(key) &&
                !props.fetchedColumns.has(key)
            );
        }

        async function loadSelectedRows() {
            const load = Symbol();
            latestLoad = load;
            const tables = props.tables.filter((table) =>
                selectedTableIds.value.includes(table.id),
            );
            const columns = new Set(selectedColumnKeys.value);
            isLoading.value = true;
            const rows = await Promise.all(
                tables.map((table) => props.loadRows(table.id, columns)),
            );
            if (latestLoad !== load) {
                return;
            }
            isLoading.value = false;
            // A null list means the shown package.json changed mid-load: nothing valid to save.
            loadedTables.value = rows.every((list) => list !== null)
                ? tables.map((table, i) => ({ title: table.title, dependencies: rows[i] }))
                : null;
        }

        watch([selectedTableIds, selectedColumnKeys], loadSelectedRows, { immediate: true });

        // A sync render (PDF of a big table) blocks the page; clicks made meanwhile
        // queue up and run after it. Unlock after them, in a later task.
        function unlockAfterQueuedClicks() {
            setTimeout(() => {
                isExporting.value = false;
            });
        }

        // Format libraries can fail on input or browser limits beyond this app's control.
        async function download() {
            const tables = loadedTables.value;
            if (!tables || !canDownload.value) {
                return;
            }
            const exporter = EXPORTERS.find((e) => e.id === formatId.value)!;
            isExporting.value = true;
            hasFailed.value = false;
            const document = buildExportDocument(
                props.title,
                tables,
                selectedColumns.value.map((c) => c.key),
            );
            try {
                const blob = await exporter.render(document);
                downloadBlob(blob, `${exportFileBaseName(props.title)}.${exporter.extension}`);
            } catch {
                hasFailed.value = true;
            }
            unlockAfterQueuedClicks();
            if (!hasFailed.value) {
                emit("close");
            }
        }

        return {
            t,
            EXPORTERS,
            columnOptions,
            selectedTableIds,
            selectedColumnKeys,
            formatId,
            hasFailed,
            canDownload,
            isColumnLoading,
            download,
        };
    },
});
