import { ref, computed, useId, defineComponent } from "vue";
import { useColumnPreferences } from "./composables/useColumnPreferences";
import { usePackageJsonHistory } from "./composables/usePackageJsonHistory";
import { usePackageJsonSources } from "./composables/usePackageJsonSources";
import { useShareState } from "./composables/useShareState";
import DependenciesTable from "./components/DependenciesTable.vue";
import ColumnVisibilityPanel from "./components/ColumnVisibilityPanel.vue";
import Modal from "./components/Modal.vue";
import SourceTreeBrowser from "./components/SourceTreeBrowser.vue";
import PackageSummaryCard from "./components/PackageSummaryCard.vue";
import SettingsMenu from "./components/SettingsMenu.vue";
import IconUpload from "./components/IconUpload.vue";
import ExportDialog from "./components/ExportDialog.vue";
import VueJsonPretty from "vue-json-pretty";
import "vue-json-pretty/lib/styles.css";
import appPackageJson from "../package.json";
import { JSON_INDENT } from "./constants";
import { t } from "./i18n";
import { WORKSPACE_ROOT, workspacePatternsOf } from "./utils/workspaces";
import { isRowRetryable } from "./utils/packageJsonHistory";
import type { DependencyListId, DependencyRow, PackageInfo } from "./types";

type ModalContent =
    | { kind: "table"; sectionId: string }
    | { kind: "sourceTree"; dependency: PackageInfo }
    | { kind: "summary"; dependency: DependencyRow }
    | { kind: "export" };

export default defineComponent({
    components: {
        DependenciesTable,
        ColumnVisibilityPanel,
        Modal,
        SourceTreeBrowser,
        PackageSummaryCard,
        SettingsMenu,
        IconUpload,
        ExportDialog,
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
            reorderColumns,
        } = useColumnPreferences();
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
                dependencies: deps.value,
                isLoading: isLoadingDeps.value,
                hasRetryableRows: deps.value.some(isRowRetryable),
            },
            {
                id: "devDeps" as DependencyListId,
                title: t("sections.devDeps"),
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

        function expandTable(sectionId: string) {
            modalContent.value = { kind: "table", sectionId };
        }

        function openSourceTree(dependency: PackageInfo) {
            modalContent.value = { kind: "sourceTree", dependency };
        }

        function showPackageSummary(dependency: DependencyRow) {
            modalContent.value = { kind: "summary", dependency };
        }

        function openExport() {
            modalContent.value = { kind: "export" };
        }

        function closeModal() {
            modalContent.value = null;
        }

        const tableProps = computed(() => ({
            columns: visibleColumnKeys.value,
            searchQuery: searchQuery.value,
            shrinkLabels: shrinkColumnLabels.value,
            pendingColumns: pendingColumns.value,
        }));
        const tableListeners = {
            loadPackage: loadDependency,
            reorderColumns,
            openSourceTree,
            selectPackage: showPackageSummary,
        };

        return {
            t,
            isLoadingInput,
            urlInput,
            fileInputRef,
            searchInputId,
            searchQuery,
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
            tableProps,
            tableListeners,
            modalContent,
            expandedSection,
            expandTable,
            openSourceTree,
            closeModal,
            isRetrying,
            retryFailedRows,
        };
    },
});
