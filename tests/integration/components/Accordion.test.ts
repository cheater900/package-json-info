import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import Accordion from "../../../src/app/components/Accordion.vue";

// Real <Transition> (VTU stubs it by default) so after-leave fires; jsdom
// loads no CSS, so each transition ends on the next frames.
function mountAccordion() {
    return mount(Accordion, {
        global: { stubs: { transition: false } },
        slots: { summary: "Columns", default: "<p>body</p>" },
    });
}

function isDetailsOpen(wrapper: ReturnType<typeof mountAccordion>) {
    return (wrapper.element as HTMLDetailsElement).open;
}

describe("Accordion", () => {
    it("starts open with body visible", () => {
        const wrapper = mountAccordion();

        expect(isDetailsOpen(wrapper)).toBe(true);
        expect(wrapper.find("p").isVisible()).toBe(true);
    });

    it("keeps details open until body collapse ends", async () => {
        const wrapper = mountAccordion();

        await wrapper.find("summary").trigger("click");

        expect(isDetailsOpen(wrapper)).toBe(true);
        await vi.waitFor(() => expect(isDetailsOpen(wrapper)).toBe(false));
        expect(wrapper.find("p").isVisible()).toBe(false);
    });

    it("reopens details + body on second click", async () => {
        const wrapper = mountAccordion();
        await wrapper.find("summary").trigger("click");
        await vi.waitFor(() => expect(isDetailsOpen(wrapper)).toBe(false));

        await wrapper.find("summary").trigger("click");

        expect(isDetailsOpen(wrapper)).toBe(true);
        expect(wrapper.find("p").isVisible()).toBe(true);
    });

    it("stays open when reopened mid-collapse", async () => {
        const wrapper = mountAccordion();

        await wrapper.find("summary").trigger("click");
        await wrapper.find("summary").trigger("click");
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(isDetailsOpen(wrapper)).toBe(true);
        expect(wrapper.find("p").isVisible()).toBe(true);
    });
});
