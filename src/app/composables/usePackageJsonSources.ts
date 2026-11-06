import { ref, watch, onScopeDispose } from "vue";
import type { Ref } from "vue";
import { URL_SYNC_DEBOUNCE_MS } from "../constants";
import {
    asSource,
    fetchDependencySource,
    fetchUrlSource,
    fetchWorkspaceSource,
} from "../../core/api/packageJsonSource";
import type { LoadedSource } from "../../core/api/packageJsonSource";
import { t } from "../../core/i18n";
import { hrefWithInputUrlParam, readInputUrlParam } from "../utils/urlInputSync";
import { isHttpUrl } from "../../core/utils/url";
import { settle } from "../../core/utils/settle";
import type { PackageInput } from "../../core/types";
import type { EntrySource } from "../utils/packageJsonHistory";
import type { WorkspaceContext } from "../../core/utils/workspaces";

/**
 * How one load reports and tags its result. Empty text shows `emptyMessage`;
 * a failure shows `failureMessage`, or the error's own message when none is
 * given. `source` tags the history entry for share links.
 */
type LoadOptions = {
    emptyMessage: string;
    failureMessage?: string;
    source?: EntrySource | null;
};

/**
 * Owns every way of bringing in package.json text (URL, repo URL, file,
 * clipboard, drill-down into a dependency, monorepo workspace) and hands the text to
 * `loadPackageJsonText`. Failures land in `loadError`.
 */
export function usePackageJsonSources(
    loadPackageJsonText: (
        text: string,
        workspace?: WorkspaceContext | null,
        source?: EntrySource | null,
    ) => boolean,
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
     * Runs one load: `readContent` resolves to a package.json source. Only
     * the most recent load applies, so a slow fetch can't overwrite a newer
     * paste or upload. Resolves to true once the text is loaded.
     */
    async function loadFromSource(
        readContent: () => Promise<LoadedSource | null>,
        { emptyMessage, failureMessage, source = null }: LoadOptions,
    ): Promise<boolean> {
        const loadToken = Symbol();
        latestLoadToken = loadToken;
        isLoadingInput.value = true;
        loadError.value = null;
        const result = await settle(readContent);
        if (latestLoadToken !== loadToken) {
            return false;
        }
        isLoadingInput.value = false;
        if (!result.ok) {
            loadError.value = failureMessage ?? result.error.message;
            return false;
        }
        if (!result.value?.text) {
            loadError.value = emptyMessage;
            return false;
        }
        return loadPackageJsonText(result.value.text, result.value.workspace ?? null, source);
    }

    function loadFromClipboard() {
        return loadFromSource(() => asSource(navigator.clipboard.readText()), {
            emptyMessage: t("errors.clipboardEmpty"),
            failureMessage: t("errors.clipboard"),
        });
    }

    async function loadFromFile(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return false;
        }
        // Reset so choosing the same file again still fires `change`.
        input.value = "";
        return loadFromSource(() => asSource(file.text()), {
            emptyMessage: t("errors.fileEmpty"),
            failureMessage: t("errors.fileRead"),
        });
    }

    /** Repo host URLs resolve to the repo's package.json; any other URL is fetched as-is. */
    async function loadUrl(input: string) {
        const url = input.trim();
        if (!url) {
            loadError.value = t("errors.urlEmpty");
            return false;
        }
        // Checked before loadFromSource, so a bad URL leaves a running load alone.
        if (!isHttpUrl(url)) {
            loadError.value = t("errors.urlInvalid");
            return false;
        }
        return loadFromSource(() => fetchUrlSource(url), {
            emptyMessage: t("errors.urlNotFound"),
            source: { kind: "url", url },
        });
    }

    function loadFromUrlInput() {
        return loadUrl(urlInput.value);
    }

    function loadDependency({ name, version }: PackageInput) {
        return loadFromSource(() => fetchDependencySource({ name, version }), {
            emptyMessage: t("errors.dependencyNotFound", { name }),
            source: { kind: "dependency", name, version },
        });
    }

    /** Loads another workspace of the same monorepo; the workspace list carries over. */
    function loadWorkspace(context: WorkspaceContext, path: string) {
        const message = t("errors.workspaceNotFound", { path });
        return loadFromSource(() => fetchWorkspaceSource(context, path), {
            emptyMessage: message,
            failureMessage: message,
            source: { kind: "workspace", path },
        });
    }

    return {
        isLoadingInput,
        urlInput,
        loadFromClipboard,
        loadFromFile,
        loadFromUrlInput,
        loadUrl,
        loadDependency,
        loadWorkspace,
    };
}
