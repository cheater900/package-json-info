import { ref, watch, onScopeDispose } from "vue";
import type { Ref } from "vue";
import { URL_SYNC_DEBOUNCE_MS } from "../constants";
import { fetchPackageJsonForVersion } from "../api/npmPackage";
import { fetchPackageJsonFromRepo } from "../api/repoPackageJson";
import { fetchText } from "../api/http";
import { t } from "../i18n";
import { hrefWithInputUrlParam, readInputUrlParam } from "../utils/urlInputSync";
import { isHttpUrl } from "../utils/url";
import { isRepoHostUrl } from "../utils/repoUrl";
import { settle } from "../utils/settle";
import type { PackageInput } from "../types";

/**
 * Owns every way of bringing in package.json text (URL, repo URL, file,
 * clipboard, drill-down into a dependency) and hands the text to
 * `loadPackageJsonText`. Failures land in `loadError`.
 */
export function usePackageJsonSources(
    loadPackageJsonText: (text: string) => boolean,
    loadError: Ref<string | null>,
) {
    const isLoadingInput = ref(false);
    // Mirrors ?inputUrl= so the URL input can be shared and reloaded.
    // replaceState keeps typing out of browser history; debounced because
    // browsers throw once a page calls it ~100 times in a few seconds.
    const urlInput = ref(readInputUrlParam(window.location.search));
    let urlSyncTimer: ReturnType<typeof setTimeout> | undefined;
    // Only the most recent load may apply; an older, slower one is dropped.
    let latestLoadToken: symbol | undefined;

    watch(urlInput, (value) => {
        clearTimeout(urlSyncTimer);
        urlSyncTimer = setTimeout(() => {
            window.history.replaceState(
                null,
                "",
                hrefWithInputUrlParam(window.location.href, value),
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
    async function loadFromSource(
        readContent: () => Promise<string | null>,
        emptyMessage: string,
        failureMessage: string | null = null,
    ) {
        const loadToken = Symbol();
        latestLoadToken = loadToken;
        isLoadingInput.value = true;
        loadError.value = null;
        const result = await settle(readContent);
        if (latestLoadToken !== loadToken) {
            return;
        }
        isLoadingInput.value = false;
        if (!result.ok) {
            loadError.value = failureMessage ?? result.error.message;
            return;
        }
        if (!result.value) {
            loadError.value = emptyMessage;
            return;
        }
        loadPackageJsonText(result.value);
    }

    function loadFromClipboard() {
        return loadFromSource(
            () => navigator.clipboard.readText(),
            t("errors.clipboardEmpty"),
            t("errors.clipboard"),
        );
    }

    function loadFromFile(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return;
        }
        // Reset so choosing the same file again still fires `change`.
        input.value = "";
        return loadFromSource(() => file.text(), t("errors.fileEmpty"), t("errors.fileRead"));
    }

    /** Repo host URLs resolve to the repo's package.json; any other URL is fetched as-is. */
    function loadFromUrlInput() {
        const url = urlInput.value.trim();
        if (!url) {
            loadError.value = t("errors.urlEmpty");
            return;
        }
        // fetch() resolves a scheme-less input against this app's own origin.
        if (!isHttpUrl(url)) {
            loadError.value = t("errors.urlInvalid");
            return;
        }
        return loadFromSource(
            () => (isRepoHostUrl(url) ? fetchPackageJsonFromRepo(url) : fetchText(url)),
            t("errors.urlNotFound"),
        );
    }

    function loadDependency({ name, version }: PackageInput) {
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
