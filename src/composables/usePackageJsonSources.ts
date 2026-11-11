import { ref, watch, onScopeDispose } from "vue";
import type { Ref } from "vue";
import { GITHUB_HOST, URL_SYNC_DEBOUNCE_MS } from "../constants";
import { fetchPackageJsonForVersion } from "../api/npmPackage";
import { fetchPackageJsonFromRepo } from "../api/repoPackageJson";
import { fetchText } from "../api/http";
import { fetchWorkspaceContext, fetchWorkspacePackageJson } from "../api/workspaces";
import { t } from "../i18n";
import { hrefWithInputUrlParam, readInputUrlParam } from "../utils/urlInputSync";
import { isHttpUrl } from "../utils/url";
import { isRepoHostUrl } from "../utils/repoUrl";
import { settle } from "../utils/settle";
import type { PackageInput } from "../types";
import type { EntrySource } from "../utils/packageJsonHistory";
import type { WorkspaceContext } from "../utils/workspaces";

/** Package.json text, with the monorepo it came from when one is known. */
type LoadedSource = {
    text: string;
    workspace?: WorkspaceContext | null;
};

async function asSource(text: Promise<string | null>): Promise<LoadedSource | null> {
    const resolved = await text;
    return resolved == null ? null : { text: resolved };
}

/** A repo's root package.json; a GitHub repo also gets its workspaces listed. */
async function readRepoSource(url: string): Promise<LoadedSource | null> {
    const found = await fetchPackageJsonFromRepo(url);
    if (!found) {
        return null;
    }
    if (found.slug.host !== GITHUB_HOST) {
        return { text: found.text };
    }
    const repo = { owner: found.slug.owner, repo: found.slug.repo, branch: found.branch };
    return { text: found.text, workspace: await fetchWorkspaceContext(repo, found.text) };
}

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
     * Runs one load: `readContent` resolves to a package.json source. Empty text
     * shows `emptyMessage`; a failure shows `failureMessage`, or the error's
     * own message when none is given. Only the most recent load applies, so
     * a slow fetch can't overwrite a newer paste or upload. `source` tags the
     * history entry for share links. Resolves to true once the text is loaded.
     */
    async function loadFromSource(
        readContent: () => Promise<LoadedSource | null>,
        emptyMessage: string,
        failureMessage: string | null = null,
        source: EntrySource | null = null,
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
        return loadFromSource(
            () => asSource(navigator.clipboard.readText()),
            t("errors.clipboardEmpty"),
            t("errors.clipboard"),
        );
    }

    async function loadFromFile(event: Event) {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) {
            return false;
        }
        // Reset so choosing the same file again still fires `change`.
        input.value = "";
        return loadFromSource(
            () => asSource(file.text()),
            t("errors.fileEmpty"),
            t("errors.fileRead"),
        );
    }

    /** Repo host URLs resolve to the repo's package.json; any other URL is fetched as-is. */
    async function loadUrl(input: string) {
        const url = input.trim();
        if (!url) {
            loadError.value = t("errors.urlEmpty");
            return false;
        }
        // fetch() resolves a scheme-less input against this app's own origin.
        if (!isHttpUrl(url)) {
            loadError.value = t("errors.urlInvalid");
            return false;
        }
        return loadFromSource(
            () => (isRepoHostUrl(url) ? readRepoSource(url) : asSource(fetchText(url))),
            t("errors.urlNotFound"),
            null,
            { kind: "url", url },
        );
    }

    function loadFromUrlInput() {
        return loadUrl(urlInput.value);
    }

    function loadDependency({ name, version }: PackageInput) {
        return loadFromSource(
            () => asSource(fetchPackageJsonForVersion(name, version)),
            t("errors.dependencyNotFound", { name }),
            null,
            { kind: "dependency", name, version },
        );
    }

    /** Loads another workspace of the same monorepo; the workspace list carries over. */
    function loadWorkspace(context: WorkspaceContext, path: string) {
        const message = t("errors.workspaceNotFound", { path });
        return loadFromSource(
            async () => ({
                text: await fetchWorkspacePackageJson(context.repo, path),
                workspace: { ...context, current: path },
            }),
            message,
            message,
            { kind: "workspace", path },
        );
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
