import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FileTreeItem from "../../../src/app/components/FileTreeItem.vue";

const directory = {
    name: "src",
    path: "src",
    type: "directory",
    size: 0,
    children: [
        {
            name: "lib",
            path: "src/lib",
            type: "directory",
            size: 0,
            children: [{ name: "deep.js", path: "src/lib/deep.js", type: "file", size: 1 }],
        },
        { name: "helper.js", path: "src/helper.js", type: "file", size: 5 },
    ],
};

function fileButtons(wrapper: ReturnType<typeof mount>) {
    return wrapper.findAll("button.file-tree-item__file");
}

describe("FileTreeItem", () => {
    it("starts directory collapsed, hides children", () => {
        const wrapper = mount(FileTreeItem, { props: { node: directory } });

        expect(wrapper.find(".file-tree-item__toggle").text()).toContain("src");
        expect(fileButtons(wrapper)).toHaveLength(0);
    });

    it("toggle click expands directory, second click collapses", async () => {
        const wrapper = mount(FileTreeItem, { props: { node: directory } });
        const toggle = wrapper.find(".file-tree-item__toggle");

        await toggle.trigger("click");
        expect(fileButtons(wrapper).map((b) => b.text())).toEqual(["helper.js"]);

        await toggle.trigger("click");
        expect(fileButtons(wrapper)).toHaveLength(0);
    });

    it("emits select-file with path on file click", async () => {
        const file = { name: "index.js", path: "index.js", type: "file", size: 1 };
        const wrapper = mount(FileTreeItem, { props: { node: file } });

        await wrapper.find("button.file-tree-item__file").trigger("click");

        expect(wrapper.emitted("select-file")).toEqual([["index.js"]]);
    });

    it("bubbles select-file from nested directory to root", async () => {
        const wrapper = mount(FileTreeItem, { props: { node: directory } });
        await wrapper.find(".file-tree-item__toggle").trigger("click");
        await wrapper.findAll(".file-tree-item__toggle")[1].trigger("click");

        await fileButtons(wrapper)
            .find((b) => b.text() === "deep.js")!
            .trigger("click");

        expect(wrapper.emitted("select-file")).toEqual([["src/lib/deep.js"]]);
    });

    it("marks only file at selectedPath as selected", async () => {
        const wrapper = mount(FileTreeItem, {
            props: { node: directory, selectedPath: "src/helper.js" },
        });
        await wrapper.find(".file-tree-item__toggle").trigger("click");
        await wrapper.findAll(".file-tree-item__toggle")[1].trigger("click");

        const selected = wrapper.findAll(".file-tree-item__file--selected");

        expect(selected.map((b) => b.text())).toEqual(["helper.js"]);
    });
});
