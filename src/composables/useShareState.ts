import { watch } from "vue";
import type { Ref } from "vue";
import { encodeSteps, hrefWithSteps, parseSteps } from "../utils/shareState";
import { WORKSPACE_ROOT } from "../utils/workspaces";
import type { EntrySource, HistoryEntry } from "../utils/packageJsonHistory";
import type { WorkspaceContext } from "../utils/workspaces";
import type { PackageInput } from "../types";

/** Loaders a share link replays; each resolves to true once its entry is loaded. */
type ShareLoaders = {
    loadUrl: (url: string) => Promise<boolean>;
    loadDependency: (dependency: PackageInput) => Promise<boolean>;
    loadWorkspace: (context: WorkspaceContext, path: string) => Promise<boolean>;
};

/**
 * Keeps the `step` query params equal to the history chain up to the current
 * entry, so the address bar is a link to the same view. `replaySteps` loads
 * the chain of the opened link; the address bar is left alone until it ends.
 */
export function useShareState(
    history: Ref<HistoryEntry[]>,
    historyIndex: Ref<number>,
    loaders: ShareLoaders,
) {
    let isReplayDone = false;

    function syncAddressBar() {
        if (!isReplayDone) {
            return;
        }
        const href = hrefWithSteps(
            window.location.href,
            encodeSteps(history.value, historyIndex.value),
        );
        // Browsers throttle replaceState; skip writes that change nothing.
        if (href !== window.location.href) {
            window.history.replaceState(null, "", href);
        }
    }

    /** A workspace step loads only a folder listed for the current entry's repo. */
    async function loadStep(source: EntrySource) {
        if (source.kind === "url") {
            return loaders.loadUrl(source.url);
        }
        if (source.kind === "dependency") {
            return loaders.loadDependency({ name: source.name, version: source.version });
        }
        const context = history.value[historyIndex.value]?.workspace;
        if (!context) {
            return false;
        }
        if (source.path !== WORKSPACE_ROOT && !context.paths.includes(source.path)) {
            return false;
        }
        return loaders.loadWorkspace(context, source.path);
    }

    /** Loads the link's steps in order; the first failed step ends the replay. */
    async function replaySteps() {
        for (const source of parseSteps(window.location.search)) {
            if (!(await loadStep(source))) {
                break;
            }
        }
        isReplayDone = true;
        syncAddressBar();
    }

    watch([history, historyIndex], syncAddressBar);

    return { replaySteps };
}
