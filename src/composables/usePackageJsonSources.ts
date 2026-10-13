import { ref, watch, onScopeDispose } from "vue";
import { URL_SYNC_DEBOUNCE_MS } from "../constants";
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
    // replaceState keeps typing out of browser history; debounced because
    // browsers throw once a page calls it ~100 times in a few seconds.
    const urlInput = ref(readInputUrlParam(window.location.search));
    let urlSyncTimer;
    // Only the most recent load may apply; an older, slower one is dropped.
    let latestLoadToken;

    watch(urlInput, (value) => {
        clearTimeout(urlSyncTimer);
        urlSyncTimer = setTimeout(() => {
            const search = withInputUrlParam(window.location.search, value);
            window.history.replaceState(
                null,
                "",
                `${window.location.pathname}${search}${window.location.hash}`,
            );
        }, URL_SYNC_DEBOUNCE_MS);
    });
    onScopeDispose(() => clearTimeout(urlSyncTimer));

    /**
     * Runs one load: `readContent` resolves to package.json text. Empty text
     * shows `emptyMessage`; a failure shows `failureMessage`, or the error's
     * own message when none is given. Only the most recent load applies, so
     * a slow fetch can't overwrite a newer paste or upload.
     */
    async function loadFromSource(readContent, emptyMessage, failureMessage = null) {
        const loadToken = Symbol();
        latestLoadToken = loadToken;
        isLoadingInput.value = true;
        loadError.value = null;
        let content;
        let failure;
        try {
            content = await readContent();
        } catch (err) {
            failure = err;
        }
        if (latestLoadToken !== loadToken) {
            return;
        }
        isLoadingInput.value = false;
        if (failure) {
            loadError.value = failureMessage ?? failure.message;
            return;
        }
        if (!content) {
            loadError.value = emptyMessage;
            return;
        }
        loadPackageJsonText(content);
    }

    function loadFromClipboard() {
        return loadFromSource(
            () => navigator.clipboard.readText(),
            t("errors.clipboardEmpty"),
            t("errors.clipboard"),
        );
    }

    function loadFromFile(event) {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }
        return loadFromSource(() => file.text(), t("errors.fileEmpty"), t("errors.fileRead"));
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
