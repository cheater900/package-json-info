import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ColumnVisibilityPanel from "../../../src/components/ColumnVisibilityPanel.vue";
import { TOGGLEABLE_COLUMNS } from "../../../src/utils/tableColumns";

describe("ColumnVisibilityPanel", () => {
    it("renders one checkbox per toggleable column, and none for Name", () => {
        const wrapper = mount(ColumnVisibilityPanel, {
            props: { hiddenColumns: new Set() },
        });

        const checkboxes = wrapper.findAll('input[type="checkbox"]');
        expect(checkboxes).toHaveLength(TOGGLEABLE_COLUMNS.length);
        expect(wrapper.text()).not.toContain("Name");
    });

    it("checks a column's box when it's visible, unchecks it when hidden", () => {
        const wrapper = mount(ColumnVisibilityPanel, {
            props: { hiddenColumns: new Set(["license"]) },
        });

        const labels = wrapper.findAll("label");
        const licenseLabel = labels.find((l) => l.text() === "License")!;
        const versionLabel = labels.find((l) => l.text() === "Version")!;

        expect(licenseLabel.find("input").element.checked).toBe(false);
        expect(versionLabel.find("input").element.checked).toBe(true);
    });

    it("emits toggle-column with the column key when a checkbox changes", async () => {
        const wrapper = mount(ColumnVisibilityPanel, {
            props: { hiddenColumns: new Set() },
        });

        const licenseCheckbox = wrapper
            .findAll("label")
            .find((l) => l.text() === "License")!
            .find("input");

        await licenseCheckbox.trigger("change");

        expect(wrapper.emitted("toggle-column")).toEqual([["license"]]);
    });

    it("disables the checkbox for the last remaining visible non-name column", () => {
        const allButOne = new Set(TOGGLEABLE_COLUMNS.slice(1).map((c) => c.key));
        const wrapper = mount(ColumnVisibilityPanel, {
            props: { hiddenColumns: allButOne },
        });

        const lastVisibleLabel = TOGGLEABLE_COLUMNS[0].label;
        const checkbox = wrapper
            .findAll("label")
            .find((l) => l.text() === lastVisibleLabel)!
            .find("input");

        expect(checkbox.element.disabled).toBe(true);
    });

    it("does not disable checkboxes for already-hidden columns", () => {
        const wrapper = mount(ColumnVisibilityPanel, {
            props: { hiddenColumns: new Set(["license"]) },
        });

        const checkbox = wrapper
            .findAll("label")
            .find((l) => l.text() === "License")!
            .find("input");

        expect(checkbox.element.disabled).toBe(false);
    });
});
