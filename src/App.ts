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
import VueJsonPretty from "vue-json-pretty";
import "vue-json-pretty/lib/styles.css";
import appPackageJson from "../package.json";
import { JSON_INDENT } from "./constants";
import { t } from "./i18n";
import { WORKSPACE_ROOT, workspacePatternsOf } from "./utils/workspaces";
import type { DependencyRow, PackageInfo, PackageInput } from "./types";

type ModalContent =
    | { kind: "table"; sectionId: string }
    | { kind: "sourceTree"; dependency: PackageInfo }
    | { kind: "summary"; dependency: DependencyRow };

export default defineComponent({
    components: {
        DependenciesTable,
        ColumnVisibilityPanel,
        Modal,
        SourceTreeBrowser,
        PackageSummaryCard,
        SettingsMenu,
        IconUpload,
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
            loadError,
            history,
            historyIndex,
            canGoBack,
            canGoForward,
            goBack,
            goForward,
            loadPackageJsonText,
            retryingPackages,
            retryRow,
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
                id: "deps",
                title: t("sections.deps"),
                dependencies: deps.value,
                isLoading: isLoadingDeps.value,
            },
            {
                id: "devDeps",
                title: t("sections.devDeps"),
                dependencies: devDeps.value,
                isLoading: isLoadingDevDeps.value,
            },
        ]);

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

        function closeModal() {
            modalContent.value = null;
        }

        /** Retries one row; an open summary card of that row shows the new data. */
        async function retryPackage(input: PackageInput) {
            const row = await retryRow(input);
            const content = modalContent.value;
            const isSummaryOfRow =
                content?.kind === "summary" &&
                content.dependency.name === input.name &&
                content.dependency.version === input.version;
            if (!row || !isSummaryOfRow) {
                return;
            }
            modalContent.value = { kind: "summary", dependency: row };
        }

        const tableProps = computed(() => ({
            columns: visibleColumnKeys.value,
            searchQuery: searchQuery.value,
            shrinkLabels: shrinkColumnLabels.value,
            retryingPackages: retryingPackages.value,
        }));
        const tableListeners = {
            loadPackage: loadDependency,
            reorderColumns,
            openSourceTree,
            selectPackage: showPackageSummary,
            retryPackage,
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
            tableProps,
            tableListeners,
            modalContent,
            expandedSection,
            expandTable,
            openSourceTree,
            closeModal,
            retryingPackages,
            retryPackage,
        };
    },
});
