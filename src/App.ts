import { ref, computed, useId, defineComponent } from "vue";
import { useColumnPreferences } from "./composables/useColumnPreferences";
import { usePackageJsonHistory } from "./composables/usePackageJsonHistory";
import { usePackageJsonSources } from "./composables/usePackageJsonSources";
import DependenciesTable from "./components/DependenciesTable.vue";
import ColumnVisibilityPanel from "./components/ColumnVisibilityPanel.vue";
import Modal from "./components/Modal.vue";
import SourceTreeBrowser from "./components/SourceTreeBrowser.vue";
import PackageSummaryCard from "./components/PackageSummaryCard.vue";
import VueJsonPretty from "vue-json-pretty";
import "vue-json-pretty/lib/styles.css";
import packageJson from "../package.json";
import { t } from "./i18n";

export default defineComponent({
    components: {
        DependenciesTable,
        ColumnVisibilityPanel,
        Modal,
        SourceTreeBrowser,
        PackageSummaryCard,
        VueJsonPretty,
    },
    setup() {
        const fileInputRef = ref(null);
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
        } = usePackageJsonHistory(visibleColumns);
        const {
            isLoadingInput,
            urlInput,
            loadFromClipboard,
            loadFromFile,
            loadFromUrlInput,
            loadDependency,
        } = usePackageJsonSources(loadPackageJsonText, loadError);

        // This app's own package.json is the first history entry.
        loadPackageJsonText(JSON.stringify(packageJson, null, 2));

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

        // One shared modal; at most one of these shows at a time:
        // { kind: "table", sectionId } | { kind: "sourceTree", dependency } | { kind: "summary", dependency }
        const modalContent = ref(null);
        const expandedSection = computed(() =>
            modalContent.value?.kind === "table"
                ? tableSections.value.find((s) => s.id === modalContent.value.sectionId)
                : null,
        );

        function expandTable(sectionId) {
            modalContent.value = { kind: "table", sectionId };
        }

        function openSourceTree(dependency) {
            modalContent.value = { kind: "sourceTree", dependency };
        }

        function showPackageSummary(dependency) {
            modalContent.value = { kind: "summary", dependency };
        }

        function closeModal() {
            modalContent.value = null;
        }

        const tableProps = computed(() => ({
            columns: visibleColumnKeys.value,
            searchQuery: searchQuery.value,
            shrinkLabels: shrinkColumnLabels.value,
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
        };
    },
});
