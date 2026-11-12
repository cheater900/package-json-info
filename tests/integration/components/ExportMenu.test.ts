import { describe, it, expect, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import ExportMenu from "../../../src/components/ExportMenu.vue";
import { EXPORTERS } from "../../../src/utils/export";
import { exportDocumentFixture } from "../../fixtures/exportDocument";

function mountMenu(disabled = false) {
    return mount(ExportMenu, {
        props: { document: exportDocumentFixture, fileBaseName: "my-app-dependencies", disabled },
    });
}

function stubObjectUrl() {
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    return vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export");
}

describe("ExportMenu", () => {
    it("renders one button per exporter, in registry order", () => {
        const labels = mountMenu()
            .findAll("button")
            .map((b) => b.text());
        expect(labels).toEqual(EXPORTERS.map((e) => e.label));
    });

    it("disables every button when disabled", () => {
        const buttons = mountMenu(true).findAll("button");
        expect(buttons.every((b) => b.attributes("disabled") !== undefined)).toBe(true);
    });

    it("click renders document and downloads file named after format", async () => {
        const csv = EXPORTERS.find((e) => e.id === "csv")!;
        const render = vi.spyOn(csv, "render");
        const createObjectURL = stubObjectUrl();
        const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
        const wrapper = mountMenu();
        await wrapper
            .findAll("button")
            .find((b) => b.text() === csv.label)!
            .trigger("click");
        await flushPromises();
        expect(render).toHaveBeenCalledWith(exportDocumentFixture);
        expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
        const link = click.mock.contexts[0] as HTMLAnchorElement;
        expect(link.download).toBe("my-app-dependencies.csv");
        expect(link.href).toBe("blob:export");
    });

    it("shows error when render throws", async () => {
        const csv = EXPORTERS.find((e) => e.id === "csv")!;
        vi.spyOn(csv, "render").mockImplementation(() => {
            throw new Error("boom");
        });
        const wrapper = mountMenu();
        await wrapper.findAll("button")[0].trigger("click");
        await flushPromises();
        expect(wrapper.find('[role="alert"]').text()).toBe(
            "Export failed. Try again or pick another format.",
        );
    });
});
