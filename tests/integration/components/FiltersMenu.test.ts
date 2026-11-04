import { describe, it, expect, afterEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import FiltersMenu from "../../../src/components/FiltersMenu.vue";
import type { HealthFilters } from "../../../src/utils/healthFilters";

function mountMenu(modelValue: HealthFilters = {}) {
    return mount(FiltersMenu, { props: { modelValue }, attachTo: document.body });
}

function button(wrapper: ReturnType<typeof mountMenu>, label: string) {
    return wrapper.findAll("button").find((b) => b.text() === label)!;
}

function radio(wrapper: ReturnType<typeof mountMenu>, legend: string, label: string) {
    const fieldset = wrapper.findAll("fieldset").find((f) => f.find("legend").text() === legend)!;
    return fieldset
        .findAll("label")
        .find((l) => l.text() === label)!
        .find<HTMLInputElement>('input[type="radio"]');
}

function emittedModels(wrapper: ReturnType<typeof mountMenu>) {
    return wrapper.emitted("update:modelValue")?.map(([value]) => value);
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("FiltersMenu dropdown", () => {
    it("trigger toggles panel and aria-expanded", async () => {
        const wrapper = mountMenu();
        const trigger = wrapper.find(".filters-menu__trigger");
        const panel = wrapper.find('[role="dialog"]');
        expect(panel.isVisible()).toBe(false);

        await trigger.trigger("click");

        expect(panel.isVisible()).toBe(true);
        expect(trigger.attributes("aria-expanded")).toBe("true");
        expect(trigger.attributes("aria-controls")).toBe(panel.attributes("id"));
        await trigger.trigger("click");
        expect(panel.isVisible()).toBe(false);
    });

    it("closes on Escape, refocuses trigger", async () => {
        const wrapper = mountMenu();
        const trigger = wrapper.find(".filters-menu__trigger");
        await trigger.trigger("click");

        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        await flushPromises();

        expect(wrapper.find('[role="dialog"]').isVisible()).toBe(false);
        expect(document.activeElement).toBe(trigger.element);
    });

    it("closes on pointerdown outside, stays open on inside", async () => {
        const wrapper = mountMenu();
        await wrapper.find(".filters-menu__trigger").trigger("click");
        const panel = wrapper.find('[role="dialog"]');

        panel.element.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        await flushPromises();
        expect(panel.isVisible()).toBe(true);

        document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
        await flushPromises();
        expect(panel.isVisible()).toBe(false);
    });

    it("lists sections with Any checked first", () => {
        const wrapper = mountMenu();
        const fieldset = wrapper.findAll("fieldset")[0];

        expect(fieldset.find("legend").text()).toBe("Last published");
        expect(fieldset.findAll("label")[0].text()).toBe("Any");
        expect(radio(wrapper, "Last published", "Any").element.checked).toBe(true);
    });
});

describe("FiltersMenu selection", () => {
    it("emits new model on preset select", async () => {
        const model: HealthFilters = { license: "missing" };
        const wrapper = mountMenu(model);

        await radio(wrapper, "Last published", "Over 1 year").setValue(true);

        expect(emittedModels(wrapper)).toEqual([
            { license: "missing", lastPublished: "over1Year" },
        ]);
        expect(model).toEqual({ license: "missing" });
    });

    it("checks preset from model", () => {
        const wrapper = mountMenu({ vulnerabilities: "any" });

        expect(radio(wrapper, "Vulnerabilities", "Any (1 or more)").element.checked).toBe(true);
        expect(radio(wrapper, "Vulnerabilities", "Any").element.checked).toBe(false);
    });

    it("Any removes section key", async () => {
        const wrapper = mountMenu({ license: "missing", lastUpdated: "over2Years" });

        await radio(wrapper, "License", "Any").setValue(true);

        expect(emittedModels(wrapper)).toEqual([{ lastUpdated: "over2Years" }]);
    });

    it("Clear all emits empty model, disabled when inactive", async () => {
        const wrapper = mountMenu();
        expect(button(wrapper, "Clear all").attributes("disabled")).toBeDefined();

        await wrapper.setProps({ modelValue: { license: "missing" } });
        await button(wrapper, "Clear all").trigger("click");

        expect(emittedModels(wrapper)).toEqual([{}]);
    });

    it("badge shows active count only when active", async () => {
        const wrapper = mountMenu();
        expect(wrapper.find(".filters-menu__badge").exists()).toBe(false);

        await wrapper.setProps({ modelValue: { license: "missing", source: "noRepository" } });

        const badge = wrapper.find(".filters-menu__badge");
        expect(badge.find('[aria-hidden="true"]').text()).toBe("2");
        expect(badge.find(".visually-hidden").text()).toBe("2 active");
    });
});
