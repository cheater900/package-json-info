import { describe, it, expect, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import FiltersPanel from "../../../src/app/components/FiltersPanel.vue";
import type { HealthFilters } from "../../../src/core/utils/healthFilters";

function mountPanel(modelValue: HealthFilters = {}) {
    return mount(FiltersPanel, { props: { modelValue }, attachTo: document.body });
}

function button(wrapper: ReturnType<typeof mountPanel>, label: string) {
    return wrapper.findAll("button").find((b) => b.text() === label)!;
}

function radio(wrapper: ReturnType<typeof mountPanel>, legend: string, label: string) {
    const fieldset = wrapper.findAll("fieldset").find((f) => f.find("legend").text() === legend)!;
    return fieldset
        .findAll("label")
        .find((l) => l.text() === label)!
        .find<HTMLInputElement>('input[type="radio"]');
}

function emittedModels(wrapper: ReturnType<typeof mountPanel>) {
    return wrapper.emitted("update:modelValue")?.map(([value]) => value);
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("FiltersPanel sections", () => {
    it("lists sections with Any checked first", () => {
        const wrapper = mountPanel();
        const fieldset = wrapper.findAll("fieldset")[0];

        expect(fieldset.find("legend").text()).toBe("Last published");
        expect(fieldset.findAll("label")[0].text()).toBe("Any");
        expect(radio(wrapper, "Last published", "Any").element.checked).toBe(true);
    });
});

describe("FiltersPanel selection", () => {
    it("emits new model on preset select", async () => {
        const model: HealthFilters = { license: "missing" };
        const wrapper = mountPanel(model);

        await radio(wrapper, "Last published", "Over 1 year").setValue(true);

        expect(emittedModels(wrapper)).toEqual([
            { license: "missing", lastPublished: "over1Year" },
        ]);
        expect(model).toEqual({ license: "missing" });
    });

    it("checks preset from model", () => {
        const wrapper = mountPanel({ vulnerabilities: "any" });

        expect(radio(wrapper, "Vulnerabilities", "Any (1 or more)").element.checked).toBe(true);
        expect(radio(wrapper, "Vulnerabilities", "Any").element.checked).toBe(false);
    });

    it("Any removes section key", async () => {
        const wrapper = mountPanel({ license: "missing", lastUpdated: "over2Years" });

        await radio(wrapper, "License", "Any").setValue(true);

        expect(emittedModels(wrapper)).toEqual([{ lastUpdated: "over2Years" }]);
    });

    it("Clear all emits empty model, disabled when inactive", async () => {
        const wrapper = mountPanel();
        expect(button(wrapper, "Clear all").attributes("disabled")).toBeDefined();

        await wrapper.setProps({ modelValue: { license: "missing" } });
        await button(wrapper, "Clear all").trigger("click");

        expect(emittedModels(wrapper)).toEqual([{}]);
    });
});
