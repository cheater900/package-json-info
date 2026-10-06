import { ref, watch } from "vue";
import { fetchPackageJsonForVersion } from "../api/npmPackage.ts";
import { fetchPackageJsonFromRepo, isRepoHostUrl } from "../api/repoPackageJson.ts";
import { fetchText } from "../api/http.ts";
import { t } from "../i18n";
import { readInputUrlParam, withInputUrlParam } from "../utils/urlInputSync.ts";

/**
 * Owns every way of bringing in package.json text (URL, repo URL, file,
 * clipboard, drill-down into a dependency) and hands the text to
 * `loadPackageJsonText`. Failures land in `loadError`.
 */
export function usePackageJsonSources(loadPackageJsonText, loadError) {
    const isLoadingInput = ref(false);
    // Mirrors ?inputUrl= so the URL input can be shared and reloaded.
    // replaceState keeps typing out of browser history.
    const urlInput = ref(readInputUrlParam(window.location.search));

    watch(urlInput, (value) => {
        const search = withInputUrlParam(window.location.search, value);
        window.history.replaceState(
            null,
            "",
            `${window.location.pathname}${search}${window.location.hash}`,
        );
    });

    async function loadFromSource(fetchContent, notFoundMessage) {
        isLoadingInput.value = true;
        loadError.value = null;
        let content;
        try {
            content = await fetchContent();
        } catch (err) {
            loadError.value = err.message;
            return;
        } finally {
            isLoadingInput.value = false;
        }
        if (!content) {
            loadError.value = notFoundMessage;
            return;
        }
        loadPackageJsonText(content);
    }

    async function loadFromClipboard() {
        loadError.value = null;
        let text;
        try {
            text = await navigator.clipboard.readText();
        } catch {
            loadError.value = t("errors.clipboard");
            return;
        }
        loadPackageJsonText(text);
    }

    function loadFromFile(event) {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        const reader = new FileReader();
        reader.onload = () => loadPackageJsonText(String(reader.result));
        reader.onerror = () => {
            loadError.value = t("errors.fileRead");
        };
        reader.readAsText(file);
    }

    /** Repo host URLs resolve to the repo's package.json; any other URL is fetched as-is. */
    function loadFromUrlInput() {
        const url = urlInput.value;
        return loadFromSource(
            () => (isRepoHostUrl(url) ? fetchPackageJsonFromRepo(url) : fetchText(url)),
            t("errors.urlNotFound"),
        );
    }

    function loadDependency({ name, version }) {
        return loadFromSource(
            () => fetchPackageJsonForVersion(name, version),
            t("errors.dependencyNotFound", { name }),
        );
    }

    return {
        isLoadingInput,
        urlInput,
        loadFromClipboard,
        loadFromFile,
        loadFromUrlInput,
        loadDependency,
    };
}
