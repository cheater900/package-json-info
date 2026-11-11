import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { useShareState } from "../../../src/composables/useShareState";
import { createHistoryEntry } from "../../../src/utils/packageJsonHistory";
import type { EntrySource, HistoryEntry } from "../../../src/utils/packageJsonHistory";
import type { WorkspaceContext } from "../../../src/utils/workspaces";
import { rootWorkspaceContext } from "../../fixtures/workspaces";

const STEP_URL = "url:https://github.com/o/r";
const SOURCE_URL: EntrySource = { kind: "url", url: "https://github.com/o/r" };

let scope = effectScope();

/** Share state over fake loaders: each load pushes an entry, as the real ones do. */
function setup(urlWorkspace: WorkspaceContext | null = rootWorkspaceContext) {
    const history = ref<HistoryEntry[]>([createHistoryEntry("{}", {})]);
    const historyIndex = ref(0);
    function push(workspace: WorkspaceContext | null, source: EntrySource) {
        history.value = [...history.value, createHistoryEntry("{}", {}, workspace, source)];
        historyIndex.value = history.value.length - 1;
        return true;
    }
    const loaders = {
        loadUrl: vi.fn(async (url: string) => push(urlWorkspace, { kind: "url", url })),
        loadDependency: vi.fn(async ({ name, version }: { name: string; version: string }) =>
            push(null, { kind: "dependency", name, version }),
        ),
        loadWorkspace: vi.fn(async (context: WorkspaceContext, path: string) =>
            push({ ...context, current: path }, { kind: "workspace", path }),
        ),
    };
    const share = scope.run(() => useShareState(history, historyIndex, loaders))!;
    return { ...share, ...loaders, history, historyIndex };
}

function openLink(steps: string[]) {
    const params = new URLSearchParams(steps.map((step) => ["step", step]));
    window.history.replaceState(null, "", `/?${params}`);
}

function shareSteps() {
    return new URLSearchParams(window.location.search).getAll("step");
}

beforeEach(() => {
    window.history.replaceState(null, "", "/");
});

afterEach(() => {
    scope.stop();
    scope = effectScope();
});

describe("replaySteps", () => {
    it("loads steps in order, workspace step with current entry context", async () => {
        openLink([STEP_URL, "ws:packages/a", "dep:@scope/pkg@^1.0.0"]);
        const { replaySteps, loadUrl, loadWorkspace, loadDependency, history } = setup();

        await replaySteps();

        expect(loadUrl).toHaveBeenCalledWith("https://github.com/o/r");
        expect(loadWorkspace).toHaveBeenCalledWith(rootWorkspaceContext, "packages/a");
        expect(loadDependency).toHaveBeenCalledWith({ name: "@scope/pkg", version: "^1.0.0" });
        expect(history.value).toHaveLength(4);
    });

    it("loads root workspace step", async () => {
        openLink([STEP_URL, "ws:packages/a", "ws:"]);
        const { replaySteps, loadWorkspace } = setup();

        await replaySteps();

        expect(loadWorkspace).toHaveBeenLastCalledWith(
            { ...rootWorkspaceContext, current: "packages/a" },
            "",
        );
    });

    it("stops at failed step, trims link to loaded steps", async () => {
        openLink([STEP_URL, "dep:ghost@1.0.0", "dep:left-pad@1.0.0"]);
        const { replaySteps, loadDependency } = setup();
        loadDependency.mockResolvedValueOnce(false);

        await replaySteps();

        expect(loadDependency).toHaveBeenCalledTimes(1);
        expect(shareSteps()).toEqual([STEP_URL]);
    });

    it("stops at workspace step for entry without workspace list", async () => {
        openLink([STEP_URL, "ws:packages/a", "dep:left-pad@1.0.0"]);
        const { replaySteps, loadWorkspace, loadDependency } = setup(null);

        await replaySteps();

        expect(loadWorkspace).not.toHaveBeenCalled();
        expect(loadDependency).not.toHaveBeenCalled();
    });

    it("stops at workspace path missing from list", async () => {
        openLink([STEP_URL, "ws:packages/unlisted"]);
        const { replaySteps, loadWorkspace } = setup();

        await replaySteps();

        expect(loadWorkspace).not.toHaveBeenCalled();
    });
});

describe("address bar sync", () => {
    it("keeps link steps until replay ends", async () => {
        openLink([STEP_URL, "dep:left-pad@1.0.0"]);
        let finishUrlLoad: (loaded: boolean) => void;
        const { replaySteps, loadUrl, history } = setup();
        loadUrl.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    finishUrlLoad = resolve;
                }),
        );

        const replay = replaySteps();
        history.value = [...history.value];
        await nextTick();

        expect(shareSteps()).toEqual([STEP_URL, "dep:left-pad@1.0.0"]);
        finishUrlLoad!(false);
        await replay;
        expect(shareSteps()).toEqual([]);
    });

    it("writes steps up to current entry on load, back, forward", async () => {
        window.history.replaceState(null, "", "/?inputUrl=https%3A%2F%2Fa.example");
        const { replaySteps, history, historyIndex } = setup();
        await replaySteps();

        history.value = [
            ...history.value,
            createHistoryEntry("{}", {}, null, SOURCE_URL),
            createHistoryEntry("{}", {}),
            createHistoryEntry("{}", {}, null, {
                kind: "dependency",
                name: "left-pad",
                version: "1.0.0",
            }),
        ];
        historyIndex.value = 3;
        await nextTick();
        expect(shareSteps()).toEqual([STEP_URL, "dep:left-pad@1.0.0"]);

        historyIndex.value = 2;
        await nextTick();
        expect(shareSteps()).toEqual([STEP_URL]);

        historyIndex.value = 0;
        await nextTick();
        expect(window.location.search).toBe("?inputUrl=https%3A%2F%2Fa.example");
    });

    it("skips replaceState for unchanged link", async () => {
        const replaceState = vi.spyOn(window.history, "replaceState");
        const { replaySteps, history } = setup();

        await replaySteps();
        history.value = [...history.value, createHistoryEntry("{}", {})];
        await nextTick();

        expect(replaceState).not.toHaveBeenCalled();
        replaceState.mockRestore();
    });
});
