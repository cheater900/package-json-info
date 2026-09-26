import { ref, watch, useId, defineComponent } from "vue";
import { fetchPackageJsonForVersion } from "./utils/npmPackage.ts";
import { fetchPackageJsonFromRepo, isRepoHostUrl } from "./utils/repoPackageJson.ts";
import { readInputUrlParam, withInputUrlParam } from "./utils/urlInputSync.ts";
import { useColumnPreferences } from "./composables/useColumnPreferences.ts";
import { usePackageJsonHistory } from "./composables/usePackageJsonHistory.ts";
import DependenciesTable from "./components/DependenciesTable.vue";
import ColumnVisibilityPanel from "./components/ColumnVisibilityPanel.vue";
import Modal from "./components/Modal.vue";
import SourceTreeBrowser from "./components/SourceTreeBrowser.vue";
import PackageSummaryCard from "./components/PackageSummaryCard.vue";
import VueJsonPretty from "vue-json-pretty";
import "vue-json-pretty/lib/styles.css";
import packageJson from "../package.json";

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
        const isLoadingInput = ref(false);

        // Kept in sync with the ?inputUrl= query param: read on load, written back
        // (via replaceState, so typing doesn't spam browser history) on every
        // change. Lets the URL-fetch input's text be shared/bookmarked/reloaded.
        const urlInput = ref(readInputUrlParam(window.location.search));
        const fileInputRef = ref(null);

        watch(urlInput, (value) => {
            const search = withInputUrlParam(window.location.search, value);
            const url = `${window.location.pathname}${search}${window.location.hash}`;
            window.history.replaceState(null, "", url);
        });

        // Shared by both the Deps and Dev Deps tables, so one search box filters
        // both simultaneously.
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

        async function loadFromClipboard() {
            loadError.value = null;
            try {
                const text = await navigator.clipboard.readText();
                loadPackageJsonText(text);
            } catch {
                loadError.value =
                    "Could not read the clipboard. Check the browser's clipboard permission and try again.";
            }
        }

        function onFileSelected(event) {
            const file = event.target.files?.[0];
            if (!file) {
                return;
            }
            const reader = new FileReader();
            reader.onload = () => loadPackageJsonText(String(reader.result));
            reader.onerror = () => {
                loadError.value = "Failed to read the selected file.";
            };
            reader.readAsText(file);
        }

        /**
         * Fetches the single URL input's content, routing between a repo host
         * (GitHub/GitLab/Codeberg - resolved via fetchPackageJsonFromRepo, which
         * locates package.json on the repo's default branch) and any other URL
         * (fetched directly as the package.json content).
         */
        async function fetchFromUrlInput() {
            isLoadingInput.value = true;
            loadError.value = null;
            try {
                const url = urlInput.value;
                const content = isRepoHostUrl(url)
                    ? await fetchPackageJsonFromRepo(url)
                    : await fetchUrlAsText(url);
                if (!content) {
                    throw new Error("Could not find a package.json at that URL.");
                }
                loadPackageJsonText(content);
            } catch (err) {
                loadError.value = err.message;
            } finally {
                isLoadingInput.value = false;
            }
        }

        async function fetchUrlAsText(url) {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Request failed with status ${response.status}`);
            }
            return response.text();
        }

        async function onLoadPackage({ name, version }) {
            isLoadingInput.value = true;
            loadError.value = null;
            try {
                const content = await fetchPackageJsonForVersion(name, version);
                if (!content) {
                    throw new Error(`Could not find package.json data for "${name}".`);
                }
                loadPackageJsonText(content);
            } catch (err) {
                loadError.value = err.message;
            } finally {
                isLoadingInput.value = false;
            }
        }

        // Bootstrap with this app's own package.json as the first history entry.
        loadPackageJsonText(JSON.stringify(packageJson, null, 2));

        // A single fullscreen modal shared by both tables' "expand" action, the
        // source-tree browser, and a single dependency's summary card - only one
        // of these four is ever showing, so one modal with switched content is
        // simpler than four separate ones stacking on top of each other.
        const isDepsExpanded = ref(false);
        const isDevDepsExpanded = ref(false);
        const activeSourceTreeDependency = ref(null);
        const selectedPackage = ref(null);

        function expandDeps() {
            isDevDepsExpanded.value = false;
            activeSourceTreeDependency.value = null;
            selectedPackage.value = null;
            isDepsExpanded.value = true;
        }

        function expandDevDeps() {
            isDepsExpanded.value = false;
            activeSourceTreeDependency.value = null;
            selectedPackage.value = null;
            isDevDepsExpanded.value = true;
        }

        function openSourceTree(dependency) {
            isDepsExpanded.value = false;
            isDevDepsExpanded.value = false;
            selectedPackage.value = null;
            activeSourceTreeDependency.value = dependency;
        }

        // Not wired to any UI trigger yet - a future "click a row" action will
        // call this to open the summary card for that dependency.
        function showPackageSummary(dependency) {
            isDepsExpanded.value = false;
            isDevDepsExpanded.value = false;
            activeSourceTreeDependency.value = null;
            selectedPackage.value = dependency;
        }

        function closeModal() {
            isDepsExpanded.value = false;
            isDevDepsExpanded.value = false;
            activeSourceTreeDependency.value = null;
            selectedPackage.value = null;
        }

        return {
            isLoadingInput,
            urlInput,
            fileInputRef,
            searchInputId,
            searchQuery,
            visibleColumns,
            columnOrder,
            shrinkColumnLabels,
            visibleColumnKeys,
            toggleColumn,
            reorderColumns,
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
            loadFromClipboard,
            onFileSelected,
            fetchFromUrlInput,
            onLoadPackage,
            isDepsExpanded,
            isDevDepsExpanded,
            activeSourceTreeDependency,
            selectedPackage,
            expandDeps,
            expandDevDeps,
            openSourceTree,
            showPackageSummary,
            closeModal,
        };
    },
});
