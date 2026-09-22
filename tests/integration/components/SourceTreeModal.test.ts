import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, DOMWrapper } from "@vue/test-utils";
import SourceTreeModal from "../../../src/components/SourceTreeModal.vue";
import { fetchSourceTree } from "../../../src/utils/sourceTree";

vi.mock("../../../src/utils/sourceTree", () => ({
    fetchSourceTree: vi.fn(),
}));

const npmSourceTree = { provider: "npm", tarballUrl: "https://example.com/pkg.tgz" };

const sampleTree = [
    { name: "index.js", path: "index.js", type: "file", size: 10 },
    {
        name: "src",
        path: "src",
        type: "directory",
        size: 0,
        children: [{ name: "helper.js", path: "src/helper.js", type: "file", size: 5 }],
    },
];

// Teleport moves the modal's DOM out to document.body, detached from
// wrapper.element's own subtree - wrapper.find()/text() can't see it, so
// tests mount with attachTo: document.body and query the real DOM instead.
let wrapper: ReturnType<typeof mount> | null = null;

function mountModal(props: Record<string, unknown>) {
    wrapper = mount(SourceTreeModal, { props, attachTo: document.body });
    return wrapper;
}

/** Wraps a real-DOM query result in VTU's DOMWrapper for .trigger()/.text() convenience. */
function bodyFind(selector: string): DOMWrapper<Element> | null {
    const el = document.body.querySelector(selector);
    return el ? new DOMWrapper(el) : null;
}

beforeEach(() => {
    vi.mocked(fetchSourceTree).mockReset();
});

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
});

describe("SourceTreeModal", () => {
    it("renders nothing when sourceTree is null", () => {
        mountModal({ dependencyName: null, sourceTree: null });

        expect(bodyFind(".modal-overlay")).toBeNull();
    });

    it("shows a loading state, then the file tree once it resolves", async () => {
        let resolveTree: (value: unknown) => void;
        vi.mocked(fetchSourceTree).mockReturnValue(
            new Promise((resolve) => {
                resolveTree = resolve;
            }),
        );

        mountModal({ dependencyName: "left-pad", sourceTree: npmSourceTree });
        await flushPromises();

        expect(document.body.textContent).toContain("Downloading source");

        resolveTree!({ tree: sampleTree, readFile: vi.fn() });
        await flushPromises();

        expect(document.body.textContent).toContain("index.js");
        expect(document.body.textContent).toContain("src");
        expect(document.body.textContent).not.toContain("Downloading source");
    });

    it("shows an error message when fetching the source tree fails", async () => {
        vi.mocked(fetchSourceTree).mockRejectedValue(new Error("network down"));

        mountModal({ dependencyName: "left-pad", sourceTree: npmSourceTree });
        await flushPromises();

        expect(document.body.textContent).toContain("network down");
    });

    it("fetches and displays a file's content when clicked", async () => {
        const readFile = vi.fn().mockResolvedValue("console.log(1);");
        vi.mocked(fetchSourceTree).mockResolvedValue({ tree: sampleTree, readFile });

        mountModal({ dependencyName: "left-pad", sourceTree: npmSourceTree });
        await flushPromises();

        await bodyFind("button.tree-file")!.trigger("click");
        await flushPromises();

        expect(readFile).toHaveBeenCalledWith("index.js");
        expect(bodyFind(".source-tree-content")!.text()).toBe("console.log(1);");
    });

    it("emits close when the close button is clicked", async () => {
        vi.mocked(fetchSourceTree).mockResolvedValue({ tree: [], readFile: vi.fn() });

        const w = mountModal({ dependencyName: "left-pad", sourceTree: npmSourceTree });
        await flushPromises();

        await bodyFind(".modal-close")!.trigger("click");

        expect(w.emitted("close")).toBeTruthy();
    });

    it("emits close when the backdrop (not the panel) is clicked", async () => {
        vi.mocked(fetchSourceTree).mockResolvedValue({ tree: [], readFile: vi.fn() });

        const w = mountModal({ dependencyName: "left-pad", sourceTree: npmSourceTree });
        await flushPromises();

        await bodyFind(".modal-overlay")!.trigger("click");

        expect(w.emitted("close")).toBeTruthy();
    });

    it("does not emit close when clicking inside the panel", async () => {
        vi.mocked(fetchSourceTree).mockResolvedValue({ tree: [], readFile: vi.fn() });

        const w = mountModal({ dependencyName: "left-pad", sourceTree: npmSourceTree });
        await flushPromises();

        await bodyFind(".source-tree-panel")!.trigger("click");

        expect(w.emitted("close")).toBeFalsy();
    });

    it("re-fetches when a new sourceTree prop replaces the previous one", async () => {
        vi.mocked(fetchSourceTree).mockResolvedValue({ tree: sampleTree, readFile: vi.fn() });

        const w = mountModal({ dependencyName: "left-pad", sourceTree: npmSourceTree });
        await flushPromises();

        const otherSourceTree = { provider: "github", owner: "o", repo: "r", tag: "v1.0.0" };
        await w.setProps({ dependencyName: "other-pkg", sourceTree: otherSourceTree });
        await flushPromises();

        expect(fetchSourceTree).toHaveBeenCalledWith(otherSourceTree);
        expect(fetchSourceTree).toHaveBeenCalledTimes(2);
    });
});
