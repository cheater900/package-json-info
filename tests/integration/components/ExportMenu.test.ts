import { describe, it, expect, vi, afterEach } from "vitest";
import { nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import ExportMenu from "../../../src/components/ExportMenu.vue";
import { EXPORTERS } from "../../../src/utils/export";
import { exportDocumentFixture } from "../../fixtures/exportDocument";

// Registry entries are copies of the format files; spy on the entry the menu renders.
const csvEntry = EXPORTERS.find((e) => e.id === "csv")!;

function mountMenu(disabled = false) {
    return mount(ExportMenu, {
        props: { document: exportDocumentFixture, fileBaseName: "my-app-dependencies", disabled },
    });
}

/** Stubs object URLs and link clicks, so a download saves nothing. */
function stubDownload() {
    return {
        createObjectURL: vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export"),
        revokeObjectURL: vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {}),
        click: vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}),
    };
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

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
        const render = vi.spyOn(csvEntry, "render");
        const { createObjectURL, click } = stubDownload();
        const wrapper = mountMenu();
        await wrapper
            .findAll("button")
            .find((b) => b.text() === csvEntry.label)!
            .trigger("click");
        await flushPromises();
        expect(render).toHaveBeenCalledWith(exportDocumentFixture);
        expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
        const link = click.mock.contexts[0] as HTMLAnchorElement;
        expect(link.download).toBe("my-app-dependencies.csv");
        expect(link.href).toBe("blob:export");
    });

    it("shows error when render throws", async () => {
        vi.spyOn(csvEntry, "render").mockImplementation(() => {
            throw new Error("boom");
        });
        const wrapper = mountMenu();
        await wrapper.findAll("button")[0].trigger("click");
        await flushPromises();
        expect(wrapper.find('[role="alert"]').text()).toBe(
            "Export failed. Try again or pick another format.",
        );
    });

    it("ignores second click while export runs, disables buttons until done", async () => {
        let finishRender: (blob: Blob) => void = () => {};
        const render = vi
            .spyOn(csvEntry, "render")
            .mockImplementation(() => new Promise((resolve) => (finishRender = resolve)));
        const { click } = stubDownload();
        const wrapper = mountMenu();
        const button = wrapper.findAll("button")[0];

        await button.trigger("click");
        await button.trigger("click");

        expect(render).toHaveBeenCalledTimes(1);
        expect(button.attributes("disabled")).toBeDefined();
        finishRender(new Blob(["x"]));
        await flushPromises();
        expect(click).toHaveBeenCalledTimes(1);
        await vi.waitFor(() => expect(button.attributes("disabled")).toBeUndefined());
    });

    it("ignores click queued behind sync render, unlocks in later task", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout"] });
        const render = vi.spyOn(csvEntry, "render");
        stubDownload();
        const wrapper = mountMenu();
        const button = wrapper.findAll("button")[0];

        await button.trigger("click");
        await flushPromises();
        // Second click of a double click, dispatched once the blocking render returns.
        await button.trigger("click");
        expect(render).toHaveBeenCalledTimes(1);
        vi.runAllTimers();
        await nextTick();
        await button.trigger("click");

        expect(render).toHaveBeenCalledTimes(2);
    });

    it("enables buttons again after failed export", async () => {
        vi.spyOn(csvEntry, "render").mockImplementation(() => {
            throw new Error("boom");
        });
        const wrapper = mountMenu();
        const button = wrapper.findAll("button")[0];

        await button.trigger("click");
        await flushPromises();

        await vi.waitFor(() => expect(button.attributes("disabled")).toBeUndefined());
    });

    it("keeps object URL until download has time to read it", async () => {
        vi.useFakeTimers();
        const { revokeObjectURL: revoke } = stubDownload();
        const wrapper = mountMenu();

        await wrapper.findAll("button")[0].trigger("click");
        await flushPromises();
        vi.advanceTimersByTime(1000);
        expect(revoke).not.toHaveBeenCalled();
        vi.advanceTimersByTime(60_000);

        expect(revoke).toHaveBeenCalledWith("blob:export");
    });
});
