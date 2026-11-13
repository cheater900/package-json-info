import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SourceTreeBrowser from "../../../src/components/SourceTreeBrowser.vue";
import { fetchSourceTree } from "../../../src/api/sourceTree";
import type { SourceTree } from "../../../src/api/sourceTree";
import type { FileTreeNode } from "../../../src/utils/fileTree";
import type { SourceTreeRef } from "../../../src/types";
import { npmSourceTree } from "../../fixtures/dependencies";
import { subjectOf } from "../../helpers/requests";

vi.mock("../../../src/api/sourceTree", () => ({
    fetchSourceTree: vi.fn(),
}));

const sampleTree: FileTreeNode[] = [
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
        let resolveTree: (value: SourceTree) => void;
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

        resolveTree!({ tree: sampleTree, truncated: false, readFile: vi.fn() });
        await flushPromises();

        expect(wrapper.text()).toContain("index.js");
        expect(wrapper.text()).toContain("src");
        expect(wrapper.text()).not.toContain("Downloading source");
    });

    it("shows notice for truncated tree", async () => {
        vi.mocked(fetchSourceTree).mockResolvedValue({
            tree: sampleTree,
            truncated: true,
            readFile: vi.fn(),
        });

        const wrapper = mount(SourceTreeBrowser, {
            props: { dependencyName: "big-repo", sourceTree: npmSourceTree },
        });
        await flushPromises();

        expect(wrapper.find('[role="status"]').text()).toContain("too large");
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
        vi.mocked(fetchSourceTree).mockResolvedValue({
            tree: sampleTree,
            truncated: false,
            readFile,
        });

        const wrapper = mount(SourceTreeBrowser, {
            props: { dependencyName: "left-pad", sourceTree: npmSourceTree },
        });
        await flushPromises();

        await wrapper.find("button.file-tree-item__file").trigger("click");
        await flushPromises();

        expect(readFile).toHaveBeenCalledWith("index.js");
        expect(wrapper.find(".source-tree__content").text()).toBe("console.log(1);");
    });

    it("shows read error instead of content on file read failure", async () => {
        const readFile = vi.fn().mockRejectedValue(new Error("status 404"));
        vi.mocked(fetchSourceTree).mockResolvedValue({
            tree: sampleTree,
            truncated: false,
            readFile,
        });
        const wrapper = mount(SourceTreeBrowser, {
            props: { dependencyName: "left-pad", sourceTree: npmSourceTree },
        });
        await flushPromises();

        await wrapper.find("button.file-tree-item__file").trigger("click");
        await flushPromises();

        expect(wrapper.find(".source-tree__status--error").text()).toBe("status 404");
        expect(wrapper.find(".source-tree__content").exists()).toBe(false);
    });

    it("shows loading note, marks file selected while content loads", async () => {
        const readFile = vi.fn(() => new Promise<string>(() => {}));
        vi.mocked(fetchSourceTree).mockResolvedValue({
            tree: sampleTree,
            truncated: false,
            readFile,
        });
        const wrapper = mount(SourceTreeBrowser, {
            props: { dependencyName: "left-pad", sourceTree: npmSourceTree },
        });
        await flushPromises();
        expect(wrapper.find(".source-tree__viewer").text()).toBe(
            "Select a file to view its contents.",
        );

        await wrapper.find("button.file-tree-item__file").trigger("click");

        expect(wrapper.find(".source-tree__viewer").text()).toBe("Loading…");
        expect(wrapper.find(".file-tree-item__file--selected").text()).toBe("index.js");
    });

    it("reads nested file by full path after directory expand", async () => {
        const readFile = vi.fn().mockResolvedValue("helper");
        vi.mocked(fetchSourceTree).mockResolvedValue({
            tree: sampleTree,
            truncated: false,
            readFile,
        });
        const wrapper = mount(SourceTreeBrowser, {
            props: { dependencyName: "left-pad", sourceTree: npmSourceTree },
        });
        await flushPromises();

        await wrapper.find(".file-tree-item__toggle").trigger("click");
        await wrapper
            .findAll("button.file-tree-item__file")
            .find((b) => b.text() === "helper.js")!
            .trigger("click");
        await flushPromises();

        expect(readFile).toHaveBeenCalledWith("src/helper.js");
        expect(wrapper.find(".source-tree__content").text()).toBe("helper");
    });

    it("names dependency and provider in header", async () => {
        vi.mocked(fetchSourceTree).mockResolvedValue({
            tree: sampleTree,
            truncated: false,
            readFile: vi.fn(),
        });

        const wrapper = mount(SourceTreeBrowser, {
            props: {
                dependencyName: "left-pad",
                sourceTree: { provider: "github", owner: "o", repo: "r", tag: "v1.0.0" },
            },
        });
        await flushPromises();

        expect(wrapper.find(".source-tree__title").text()).toBe("left-pad");
        expect(wrapper.find(".source-tree__provider").text()).toBe("via GitHub");
        expect(wrapper.find('[role="status"]').exists()).toBe(false);
    });

    it("skips fetch without sourceTree", async () => {
        const wrapper = mount(SourceTreeBrowser, { props: { dependencyName: "left-pad" } });
        await flushPromises();

        expect(fetchSourceTree).not.toHaveBeenCalled();
        expect(wrapper.text()).not.toContain("Downloading source");
    });

    it("clears selected file and content on new sourceTree prop", async () => {
        const readFile = vi.fn().mockResolvedValue("old content");
        vi.mocked(fetchSourceTree).mockResolvedValue({
            tree: sampleTree,
            truncated: false,
            readFile,
        });
        const wrapper = mount(SourceTreeBrowser, {
            props: { dependencyName: "left-pad", sourceTree: npmSourceTree },
        });
        await flushPromises();
        await wrapper.find("button.file-tree-item__file").trigger("click");
        await flushPromises();

        await wrapper.setProps({ sourceTree: { ...npmSourceTree } });
        await flushPromises();

        expect(wrapper.text()).not.toContain("old content");
        expect(wrapper.find(".file-tree-item__file--selected").exists()).toBe(false);
    });

    it("re-fetches on new sourceTree prop", async () => {
        vi.mocked(fetchSourceTree).mockResolvedValue({
            tree: sampleTree,
            truncated: false,
            readFile: vi.fn(),
        });

        const wrapper = mount(SourceTreeBrowser, {
            props: { dependencyName: "left-pad", sourceTree: npmSourceTree },
        });
        await flushPromises();

        const otherSourceTree: SourceTreeRef = {
            provider: "github",
            owner: "o",
            repo: "r",
            tag: "v1.0.0",
        };
        await wrapper.setProps({ dependencyName: "other-pkg", sourceTree: otherSourceTree });
        await flushPromises();

        expect(fetchSourceTree).toHaveBeenCalledWith(
            otherSourceTree,
            subjectOf(["other-pkg"], ["sourceCodeTree"]),
        );
        expect(fetchSourceTree).toHaveBeenCalledTimes(2);
    });

    it("shows last clicked file when earlier file loads slower", async () => {
        const twoFileTree: FileTreeNode[] = [
            { name: "slow.js", path: "slow.js", type: "file", size: 1 },
            { name: "fast.js", path: "fast.js", type: "file", size: 1 },
        ];
        let resolveSlow: (value: string) => void;
        const readFile = vi.fn((path: string) =>
            path === "slow.js"
                ? new Promise<string>((resolve) => {
                      resolveSlow = resolve;
                  })
                : Promise.resolve("fast content"),
        );
        vi.mocked(fetchSourceTree).mockResolvedValue({
            tree: twoFileTree,
            truncated: false,
            readFile,
        });
        const wrapper = mount(SourceTreeBrowser, {
            props: { dependencyName: "left-pad", sourceTree: npmSourceTree },
        });
        await flushPromises();
        const [slowButton, fastButton] = wrapper.findAll("button.file-tree-item__file");

        await slowButton.trigger("click");
        await fastButton.trigger("click");
        await flushPromises();
        resolveSlow!("slow content");
        await flushPromises();

        expect(wrapper.find(".source-tree__content").text()).toBe("fast content");
    });

    it("ignores tree download replaced by newer sourceTree", async () => {
        let resolveFirst: (value: SourceTree) => void;
        vi.mocked(fetchSourceTree)
            .mockReturnValueOnce(
                new Promise((resolve) => {
                    resolveFirst = resolve;
                }),
            )
            .mockResolvedValueOnce({ tree: sampleTree, truncated: false, readFile: vi.fn() });
        const wrapper = mount(SourceTreeBrowser, {
            props: { dependencyName: "left-pad", sourceTree: npmSourceTree },
        });
        const otherSourceTree: SourceTreeRef = {
            provider: "github",
            owner: "o",
            repo: "r",
            tag: "v1.0.0",
        };
        await wrapper.setProps({ sourceTree: otherSourceTree });
        await flushPromises();

        resolveFirst!({
            tree: [{ name: "stale.js", path: "stale.js", type: "file", size: 1 }],
            truncated: false,
            readFile: vi.fn(),
        });
        await flushPromises();

        expect(wrapper.text()).not.toContain("stale.js");
        expect(wrapper.text()).toContain("index.js");
    });
});
