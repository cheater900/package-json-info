import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SourceTreeBrowser from "../../../src/components/SourceTreeBrowser.vue";
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

beforeEach(() => {
    vi.mocked(fetchSourceTree).mockReset();
});

describe("SourceTreeBrowser", () => {
    it("shows loading state, then file tree", async () => {
        let resolveTree: (value: unknown) => void;
        vi.mocked(fetchSourceTree).mockReturnValue(
            new Promise((resolve) => {
                resolveTree = resolve;
            }),
        );

        const wrapper = mount(SourceTreeBrowser, {
            props: { dependencyName: "left-pad", sourceTree: npmSourceTree },
        });
        await flushPromises();

        expect(wrapper.text()).toContain("Downloading source");

        resolveTree!({ tree: sampleTree, readFile: vi.fn() });
        await flushPromises();

        expect(wrapper.text()).toContain("index.js");
        expect(wrapper.text()).toContain("src");
        expect(wrapper.text()).not.toContain("Downloading source");
    });

    it("shows error on source tree fetch failure", async () => {
        vi.mocked(fetchSourceTree).mockRejectedValue(new Error("network down"));

        const wrapper = mount(SourceTreeBrowser, {
            props: { dependencyName: "left-pad", sourceTree: npmSourceTree },
        });
        await flushPromises();

        expect(wrapper.text()).toContain("network down");
    });

    it("fetches and shows file content on click", async () => {
        const readFile = vi.fn().mockResolvedValue("console.log(1);");
        vi.mocked(fetchSourceTree).mockResolvedValue({ tree: sampleTree, readFile });

        const wrapper = mount(SourceTreeBrowser, {
            props: { dependencyName: "left-pad", sourceTree: npmSourceTree },
        });
        await flushPromises();

        await wrapper.find("button.file-tree-item__file").trigger("click");
        await flushPromises();

        expect(readFile).toHaveBeenCalledWith("index.js");
        expect(wrapper.find(".source-tree__content").text()).toBe("console.log(1);");
    });

    it("re-fetches on new sourceTree prop", async () => {
        vi.mocked(fetchSourceTree).mockResolvedValue({ tree: sampleTree, readFile: vi.fn() });

        const wrapper = mount(SourceTreeBrowser, {
            props: { dependencyName: "left-pad", sourceTree: npmSourceTree },
        });
        await flushPromises();

        const otherSourceTree = { provider: "github", owner: "o", repo: "r", tag: "v1.0.0" };
        await wrapper.setProps({ dependencyName: "other-pkg", sourceTree: otherSourceTree });
        await flushPromises();

        expect(fetchSourceTree).toHaveBeenCalledWith(otherSourceTree);
        expect(fetchSourceTree).toHaveBeenCalledTimes(2);
    });
});
