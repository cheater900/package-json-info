import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TextWrapped from "../../../src/app/components/TextWrapped.vue";

const CLASS_EXPANDED = "text-wrapped--expanded";
const CLASS_OVERFLOWING = "text-wrapped--overflowing";

function setWidths(el: Element, scrollWidth: number) {
    Object.defineProperty(el, "scrollWidth", { value: scrollWidth, configurable: true });
    Object.defineProperty(el, "clientWidth", { value: 100, configurable: true });
}

// jsdom lays nothing out: both widths read 0 unless set.
function mountWrapped(isClipped: boolean, props: { maxLength?: number } = {}) {
    const wrapper = mount(TextWrapped, { props, slots: { default: "long text" } });
    setWidths(wrapper.element, isClipped ? 300 : 100);
    return wrapper;
}

describe("TextWrapped", () => {
    it("renders slot content", () => {
        expect(mountWrapped(false).text()).toBe("long text");
    });

    it("click expands clipped text", async () => {
        const wrapper = mountWrapped(true);

        await wrapper.trigger("click");

        expect(wrapper.classes()).toContain(CLASS_EXPANDED);
    });

    it("second click collapses expanded text even when text fits again", async () => {
        const wrapper = mountWrapped(true);
        await wrapper.trigger("click");
        setWidths(wrapper.element, 100);

        await wrapper.trigger("click");

        expect(wrapper.classes()).not.toContain(CLASS_EXPANDED);
    });

    it("click on fitting text expands nothing", async () => {
        const wrapper = mountWrapped(false);

        await wrapper.trigger("click");

        expect(wrapper.classes()).not.toContain(CLASS_EXPANDED);
    });

    it.each([
        [true, true],
        [false, false],
    ])("hover with clipped=%s sets overflowing marker %s", async (isClipped, expected) => {
        const wrapper = mountWrapped(isClipped);

        await wrapper.trigger("mouseenter");

        expect(wrapper.classes().includes(CLASS_OVERFLOWING)).toBe(expected);
    });

    it("keeps CSS default width without maxLength", () => {
        expect(mountWrapped(false).attributes("style")).toBeUndefined();
    });

    it("caps width at maxLength characters while collapsed only", async () => {
        const wrapper = mountWrapped(true, { maxLength: 80 });
        expect(wrapper.element.style.maxWidth).toBe("80ch");

        await wrapper.trigger("click");

        expect(wrapper.element.style.maxWidth).toBe("");
    });
});
