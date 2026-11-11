import { describe, it, expect, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import DependencyCell from "../../../src/components/DependencyCell.vue";
import { DEPENDENCY_TABLE_COLUMNS } from "../../../src/utils/tableColumns";
import { fullDependency, sparseDependency } from "../../fixtures/dependencies";

const healthColumn = DEPENDENCY_TABLE_COLUMNS.find((c) => c.key === "healthScore")!;

function mountHealthCell(dependency: object) {
    return mount(DependencyCell, {
        attachTo: document.body,
        props: { column: healthColumn, dependency },
    });
}

afterEach(() => {
    document.body.innerHTML = "";
});

describe("DependencyCell health score", () => {
    it.each([
        [90, "90 good", "health-score--good"],
        [55, "55 fair", "health-score--fair"],
        [10, "10 poor", "health-score--poor"],
    ])("renders score %i as '%s' with band class", (healthScore, text, bandClass) => {
        const wrapper = mountHealthCell({ ...fullDependency, healthScore });

        const health = wrapper.find(".health-score");
        expect(health.text()).toBe(text);
        expect(health.classes()).toContain(bandClass);
    });

    it("lists used signals in tooltip on hover", async () => {
        const wrapper = mountHealthCell(fullDependency);

        await wrapper.find(".tooltip").trigger("mouseenter");

        expect(document.body.querySelector('[role="tooltip"]')!.textContent).toContain(
            "Health score out of 100, from: latest release age, deprecation, outdated version",
        );
    });

    it("renders '-' without tooltip for missing score", () => {
        const wrapper = mountHealthCell(sparseDependency);

        expect(wrapper.text()).toBe("-");
        expect(wrapper.find(".tooltip").exists()).toBe(false);
        expect(wrapper.find(".health-score").exists()).toBe(false);
    });
});
