import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ColumnVisibilityPanel from "../../../src/components/ColumnVisibilityPanel.vue";
import { TOGGLEABLE_COLUMNS } from "../../../src/utils/tableColumns";

describe("ColumnVisibilityPanel", () => {
    it("renders one checkbox per toggleable column, and none for Name", () => {
        const wrapper = mount(ColumnVisibilityPanel, {
            props: { visibleColumns: new Set(TOGGLEABLE_COLUMNS.map((c) => c.key)) },
        });

        const checkboxes = wrapper.findAll('input[type="checkbox"]');
        expect(checkboxes).toHaveLength(TOGGLEABLE_COLUMNS.length);
        expect(wrapper.text()).not.toContain("Name");
    });

    it("checks a column's box when it's visible, unchecks it when hidden", () => {
        const visible = new Set(
            TOGGLEABLE_COLUMNS.map((c) => c.key).filter((k) => k !== "license"),
        );
        const wrapper = mount(ColumnVisibilityPanel, {
            props: { visibleColumns: visible },
        });

        const labels = wrapper.findAll("label");
        const licenseLabel = labels.find((l) => l.text() === "License")!;
        const versionLabel = labels.find((l) => l.text() === "Version")!;

        expect(licenseLabel.find("input").element.checked).toBe(false);
        expect(versionLabel.find("input").element.checked).toBe(true);
    });

    it("emits toggle-column with the column key when a checkbox changes", async () => {
        const wrapper = mount(ColumnVisibilityPanel, {
            props: { visibleColumns: new Set(TOGGLEABLE_COLUMNS.map((c) => c.key)) },
        });

        const licenseCheckbox = wrapper
            .findAll("label")
            .find((l) => l.text() === "License")!
            .find("input");

        await licenseCheckbox.trigger("change");

        expect(wrapper.emitted("toggle-column")).toEqual([["license"]]);
    });

    it("disables the checkbox for the last remaining visible non-name column", () => {
        const onlyOneVisible = new Set([TOGGLEABLE_COLUMNS[0].key]);
        const wrapper = mount(ColumnVisibilityPanel, {
            props: { visibleColumns: onlyOneVisible },
        });

        const lastVisibleLabel = TOGGLEABLE_COLUMNS[0].label;
        const checkbox = wrapper
            .findAll("label")
            .find((l) => l.text() === lastVisibleLabel)!
            .find("input");

        expect(checkbox.element.disabled).toBe(true);
    });

    it("does not disable checkboxes for already-hidden columns", () => {
        const visible = new Set(
            TOGGLEABLE_COLUMNS.map((c) => c.key).filter((k) => k !== "license"),
        );
        const wrapper = mount(ColumnVisibilityPanel, {
            props: { visibleColumns: visible },
        });

        const checkbox = wrapper
            .findAll("label")
            .find((l) => l.text() === "License")!
            .find("input");

        expect(checkbox.element.disabled).toBe(false);
    });

    it("renders checkboxes in the given columnOrder, hidden columns included", () => {
        const reversedOrder = TOGGLEABLE_COLUMNS.map((c) => c.key).reverse();
        const wrapper = mount(ColumnVisibilityPanel, {
            props: { visibleColumns: new Set(), columnOrder: reversedOrder },
        });

        const labels = wrapper.findAll("label").map((l) => l.text());
        const expectedLabels = reversedOrder.map(
            (key) => TOGGLEABLE_COLUMNS.find((c) => c.key === key).label,
        );
        expect(labels).toEqual(expectedLabels);
    });

    it("falls back to declaration order when columnOrder is omitted", () => {
        const wrapper = mount(ColumnVisibilityPanel, {
            props: { visibleColumns: new Set() },
        });

        const labels = wrapper.findAll("label").map((l) => l.text());
        expect(labels).toEqual(TOGGLEABLE_COLUMNS.map((c) => c.label));
    });
});
