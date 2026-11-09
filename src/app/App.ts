import { ref, computed, useId, defineComponent, nextTick, watch } from "vue";
import { useColumnPreferences } from "./composables/useColumnPreferences";
import { usePackageJsonHistory } from "./composables/usePackageJsonHistory";
import { usePackageJsonSources } from "./composables/usePackageJsonSources";
import { useShareState } from "./composables/useShareState";
import DependenciesTable from "./components/DependenciesTable.vue";
import ColumnVisibilityPanel from "./components/ColumnVisibilityPanel.vue";
import Modal from "./components/Modal.vue";
import Accordion from "./components/Accordion.vue";
import CollapseTransition from "./components/CollapseTransition.vue";
import SourceTreeBrowser from "./components/SourceTreeBrowser.vue";
import PackageSummaryCard from "./components/PackageSummaryCard.vue";
import SettingsMenu from "./components/SettingsMenu.vue";
import FiltersPanel from "./components/FiltersPanel.vue";
import IconArrowDown from "./components/IconArrowDown.vue";
import IconArrowLeft from "./components/IconArrowLeft.vue";
import IconArrowRight from "./components/IconArrowRight.vue";
import IconClipboard from "./components/IconClipboard.vue";
import IconDownload from "./components/IconDownload.vue";
import IconExpand from "./components/IconExpand.vue";
import IconUpload from "./components/IconUpload.vue";
import IconReload from "./components/IconReload.vue";
import IconBoxes from "./components/IconBoxes.vue";
import IconColumns from "./components/IconColumns.vue";
import IconFileJson from "./components/IconFileJson.vue";
import IconFilter from "./components/IconFilter.vue";
import IconLayers from "./components/IconLayers.vue";
import IconMagnifier from "./components/IconMagnifier.vue";
import IconWarning from "./components/IconWarning.vue";
import IconWrench from "./components/IconWrench.vue";
import ExportDialog from "./components/ExportDialog.vue";
import NetworkLogDialog from "./components/NetworkLogDialog.vue";
import ReportDialog from "./components/ReportDialog.vue";
import IconScrollText from "./components/IconScrollText.vue";
import VueJsonPretty from "vue-json-pretty";
import "vue-json-pretty/lib/styles.css";
import appPackageJson from "../../package.json";
import { JSON_INDENT } from "../core/constants";
import { t } from "../core/i18n";
import { WORKSPACE_ROOT, workspacePatternsOf } from "../core/utils/workspaces";
import { isRowRetryable } from "./utils/packageJsonHistory";
import { isColumnVisible } from "../core/utils/tableColumns";
import {
    activeHealthFilterCount,
    columnsForHealthFilters,
    healthFiltersWithoutColumns,
} from "../core/utils/healthFilters";
import type { HealthFilters } from "../core/utils/healthFilters";
import { REPORT_COLUMN_KEYS, buildReport, reportFileBaseName } from "../core/report/buildReport";
import type { Report } from "../core/report/types";
import { replayRequest } from "./utils/networkLog";
import type { NetworkLogEntry } from "./utils/networkLog";
import type { DependencyListId, DependencyRow, PackageInfo } from "../core/types";

type ModalContent =
    | { kind: "table"; sectionId: string }
    | { kind: "sourceTree"; dependency: PackageInfo }
    | { kind: "summary"; dependency: DependencyRow }
    | { kind: "export"; sectionId: DependencyListId }
    | { kind: "networkLog" }
    | { kind: "report"; report: Report };

export default defineComponent({
    components: {
        DependenciesTable,
        ColumnVisibilityPanel,
        Modal,
        Accordion,
        CollapseTransition,
        SourceTreeBrowser,
        PackageSummaryCard,
        SettingsMenu,
        FiltersPanel,
        IconArrowDown,
        IconArrowLeft,
        IconArrowRight,
        IconClipboard,
        IconDownload,
        IconExpand,
        IconUpload,
        IconReload,
        IconBoxes,
        IconColumns,
        IconFileJson,
        IconFilter,
        IconLayers,
        IconMagnifier,
        IconWarning,
        IconWrench,
        IconScrollText,
        ExportDialog,
        NetworkLogDialog,
        ReportDialog,
        VueJsonPretty,
    },
    setup() {
        const fileInputRef = ref<HTMLInputElement | null>(null);
        // One search box filters both tables.
        const searchInputId = useId();
        const searchQuery = ref("");
        const {
            visibleColumns,
            columnOrder,
            shrinkColumnLabels,
            visibleColumnKeys,
            toggleColumn,
            showColumns,
            reorderColumns,
        } = useColumnPreferences();
        // Session only: neither persisted nor in the share link.
        const healthFilters = ref<HealthFilters>({});
        const activeFilterCount = computed(() => activeHealthFilterCount(healthFilters.value));
        const isFiltersOpen = ref(false);
        const searchRowRef = ref<HTMLElement | null>(null);
        const filtersPanelRef = ref<InstanceType<typeof FiltersPanel> | null>(null);

        // Scrolled past the panel, the sticky search row stays on screen while the
        // panel opens above view: scroll it back up to just under the row.
        async function toggleFilters() {
            isFiltersOpen.value = !isFiltersOpen.value;
            if (!isFiltersOpen.value) {
                return;
            }
            await nextTick();
            const panelTop = (filtersPanelRef.value!.$el as HTMLElement).getBoundingClientRect()
                .top;
            const rowBottom = searchRowRef.value!.getBoundingClientRect().bottom;
            if (panelTop >= rowBottom) {
                return;
            }
            window.scrollBy({ top: panelTop - rowBottom });
        }
        const filtersPanelId = useId();
        // A filter on a hidden column shows that column, which fetches its missing data.
        watch(healthFilters, (filters) => showColumns(columnsForHealthFilters(filters)));
        // Hiding a column a filter reads drops that filter: later fetches skip the column's data.
        watch(visibleColumns, (visible) => {
            healthFilters.value = healthFiltersWithoutColumns(
                healthFilters.value,
                (key) => !isColumnVisible(visible, key),
            );
        });
        const {
            pkg,
            workspace,
            deps,
            devDeps,
            isLoadingDeps,
            isLoadingDevDeps,
            pendingColumns,
            loadError,
            history,
            historyIndex,
            canGoBack,
            canGoForward,
            goBack,
            goForward,
            loadPackageJsonText,
            isRetrying,
            retryFailedRows,
            fetchedColumns,
            fetchRowsWithColumns,
        } = usePackageJsonHistory(visibleColumns);
        const {
            isLoadingInput,
            urlInput,
            loadFromClipboard,
            loadFromFile,
            loadFromUrlInput,
            loadUrl,
            loadDependency,
            loadWorkspace,
        } = usePackageJsonSources(loadPackageJsonText, loadError);
        const { replaySteps } = useShareState(history, historyIndex, {
            loadUrl,
            loadDependency,
            loadWorkspace,
        });
        const workspaceSelectId = useId();
        // Workspaces are listed only for a GitHub repo URL; other sources get a hint.
        const hasUnlistedWorkspaces = computed(
            () => workspace.value === null && workspacePatternsOf(pkg.value).length > 0,
        );

        function selectWorkspace(event: Event) {
            if (!workspace.value) {
                return;
            }
            loadWorkspace(workspace.value, (event.target as HTMLSelectElement).value);
        }

        // The built-in package.json stays the fallback view under a share link.
        loadPackageJsonText(JSON.stringify(appPackageJson, null, JSON_INDENT));
        replaySteps();

        const tableSections = computed(() => [
            {
                id: "deps" as DependencyListId,
                title: t("sections.deps"),
                icon: IconBoxes,
                dependencies: deps.value,
                isLoading: isLoadingDeps.value,
                hasRetryableRows: deps.value.some(isRowRetryable),
            },
            {
                id: "devDeps" as DependencyListId,
                title: t("sections.devDeps"),
                icon: IconWrench,
                dependencies: devDeps.value,
                isLoading: isLoadingDevDeps.value,
                hasRetryableRows: devDeps.value.some(isRowRetryable),
            },
        ]);

        const exportTitle = computed(() => pkg.value?.name || t("export.untitled"));
        // Export waits for tables and pending columns: the dialog reuses the rows they cache.
        const isLoadingTables = computed(
            () => pendingColumns.value.size > 0 || tableSections.value.some((s) => s.isLoading),
        );

        const modalContent = ref<ModalContent | null>(null);
        const expandedSection = computed(() => {
            const content = modalContent.value;
            return content?.kind === "table"
                ? tableSections.value.find((s) => s.id === content.sectionId)
                : null;
        });

        function tableModalTitle(section: string): string {
            const name = pkg.value?.name;
            return name ? t("modal.tableTitle", { section, name }) : section;
        }

        const modalTitle = computed(() => {
            const content = modalContent.value;
            switch (content?.kind) {
                case "table":
                    return tableModalTitle(expandedSection.value?.title ?? "");
                case "summary":
                    return content.dependency.name;
                case "sourceTree":
                    return t("sourceTree.title", { name: content.dependency.name });
                case "export":
                    return t("export.dialogTitle");
                case "networkLog":
                    return t("networkLog.title");
                case "report":
                    return t("report.dialogTitle");
                default:
                    return "";
            }
        });

        function expandTable(sectionId: string) {
            modalContent.value = { kind: "table", sectionId };
        }

        function openSourceTree(dependency: PackageInfo) {
            modalContent.value = { kind: "sourceTree", dependency };
        }

        function showPackageSummary(dependency: DependencyRow) {
            modalContent.value = { kind: "summary", dependency };
        }

        function openExport(sectionId: DependencyListId) {
            modalContent.value = { kind: "export", sectionId };
        }

        const isGeneratingReport = ref(false);
        const reportFileName = computed(() => reportFileBaseName(exportTitle.value));

        /** Fetches the columns the report reads, then shows the report of the rows the tables show. */
        async function generateReport() {
            isGeneratingReport.value = true;
            const sections = tableSections.value;
            const columns = new Set(REPORT_COLUMN_KEYS);
            const rows = await Promise.all(
                sections.map((section) => fetchRowsWithColumns(section.id, columns)),
            );
            isGeneratingReport.value = false;
            // A null list means the shown package.json changed mid-load: nothing valid to report.
            if (!rows.every((list) => list !== null)) {
                return;
            }
            const report = buildReport(
                {
                    title: exportTitle.value,
                    tables: sections.map((section, i) => ({
                        id: section.id,
                        title: section.title,
                        dependencies: rows[i],
                    })),
                    searchQuery: searchQuery.value,
                    healthFilters: healthFilters.value,
                },
                new Date(),
            );
            modalContent.value = { kind: "report", report };
        }

        function openNetworkLog() {
            modalContent.value = { kind: "networkLog" };
        }

        /** Retries the table rows a failed request fed; without such rows, resends the request. */
        function retryNetworkRequest(entry: NetworkLogEntry) {
            const rows = [...deps.value, ...devDeps.value].filter(
                (row) => entry.subject?.dependencies.has(row.name) && isRowRetryable(row),
            );
            if (rows.length === 0) {
                replayRequest(entry);
                return;
            }
            void retryFailedRows(rows);
        }

        function closeModal() {
            modalContent.value = null;
        }

        const tableProps = computed(() => ({
            columns: visibleColumnKeys.value,
            searchQuery: searchQuery.value,
            healthFilters: healthFilters.value,
            shrinkLabels: shrinkColumnLabels.value,
            pendingColumns: pendingColumns.value,
            isRetrying: isRetrying.value,
        }));
        const tableListeners = {
            loadPackage: loadDependency,
            reorderColumns,
            openSourceTree,
            selectPackage: showPackageSummary,
            retryRow: (row: DependencyRow) => retryFailedRows([row]),
        };

        return {
            t,
            isLoadingInput,
            urlInput,
            fileInputRef,
            searchInputId,
            searchQuery,
            healthFilters,
            activeFilterCount,
            isFiltersOpen,
            searchRowRef,
            filtersPanelRef,
            toggleFilters,
            filtersPanelId,
            visibleColumns,
            columnOrder,
            shrinkColumnLabels,
            toggleColumn,
            pkg,
            workspace,
            workspaceSelectId,
            WORKSPACE_ROOT,
            hasUnlistedWorkspaces,
            selectWorkspace,
            loadError,
            history,
            historyIndex,
            canGoBack,
            canGoForward,
            goBack,
            goForward,
            loadFromClipboard,
            loadFromFile,
            loadFromUrlInput,
            tableSections,
            exportTitle,
            isLoadingTables,
            visibleColumnKeys,
            fetchedColumns,
            fetchRowsWithColumns,
            openExport,
            isGeneratingReport,
            reportFileName,
            generateReport,
            tableProps,
            tableListeners,
            modalContent,
            expandedSection,
            modalTitle,
            expandTable,
            openSourceTree,
            openNetworkLog,
            retryNetworkRequest,
            closeModal,
            isRetrying,
            retryFailedRows,
        };
    },
});
