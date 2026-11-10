import { describe, it, expect, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import Tooltip from "../../../src/components/Tooltip.vue";
import { TOOLTIP_OFFSET_PX } from "../../../src/constants";

const TRIGGER_RECT = { left: 100, top: 50, bottom: 70, width: 40 };

// The bubble teleports to <body>, outside the wrapper's own subtree.
function bubble(): HTMLElement | null {
    return document.body.querySelector('[role="tooltip"]');
}

function mountTooltip(props: Record<string, string>) {
    const wrapper = mount(Tooltip, {
        attachTo: document.body,
        props,
        slots: { default: "<button>trigger</button>" },
    });
    wrapper.find(".tooltip").element.getBoundingClientRect = () => TRIGGER_RECT as DOMRect;
    return wrapper;
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("Tooltip", () => {
    it("shows bubble on mouseenter, hides on mouseleave", async () => {
        const wrapper = mountTooltip({ text: "Version Date" });
        expect(bubble()).toBeNull();

        await wrapper.find(".tooltip").trigger("mouseenter");
        expect(bubble()!.textContent).toContain("Version Date");

        await wrapper.find(".tooltip").trigger("mouseleave");
        expect(bubble()).toBeNull();
    });

    it("shows bubble on keyboard focus, hides on blur", async () => {
        const wrapper = mountTooltip({ text: "Version Date" });

        await wrapper.find("button").trigger("focusin");
        expect(bubble()).not.toBeNull();

        await wrapper.find("button").trigger("focusout");
        expect(bubble()).toBeNull();
    });

    it("renders no bubble without text", async () => {
        const wrapper = mountTooltip({});

        await wrapper.find(".tooltip").trigger("mouseenter");

        expect(bubble()).toBeNull();
    });

    it("centers bubble above trigger by default", async () => {
        const wrapper = mountTooltip({ text: "tip" });

        await wrapper.find(".tooltip").trigger("mouseenter");

        expect(bubble()!.style.left).toBe("120px");
        expect(bubble()!.style.top).toBe(`${TRIGGER_RECT.top - TOOLTIP_OFFSET_PX}px`);
        expect(bubble()!.classList).toContain("tooltip__bubble--top");
    });

    it("puts bubble below trigger for position bottom", async () => {
        const wrapper = mountTooltip({ text: "tip", position: "bottom" });

        await wrapper.find(".tooltip").trigger("mouseenter");

        expect(bubble()!.style.top).toBe(`${TRIGGER_RECT.bottom + TOOLTIP_OFFSET_PX}px`);
        expect(bubble()!.classList).toContain("tooltip__bubble--bottom");
    });
});
