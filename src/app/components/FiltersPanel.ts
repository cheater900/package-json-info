import { defineComponent, useId } from "vue";
import type { PropType } from "vue";
import { t } from "../../core/i18n";
import { HEALTH_FILTER_SECTIONS, activeHealthFilterCount } from "../../core/utils/healthFilters";
import type { FilterSectionId, HealthFilters } from "../../core/utils/healthFilters";

/**
 * In-page panel with one radio group per health filter section: "Any"
 * (no filter) first, then the section's presets. Emits a new
 * `HealthFilters` object on each change; "Any" drops the section's key.
 * The parent owns the toggle button and open state.
 */
export default defineComponent({
    props: {
        modelValue: {
            type: Object as PropType<HealthFilters>,
            required: true,
        },
    },
    emits: ["update:modelValue"],
    setup(props, { emit }) {
        const radioGroupId = useId();

        function selectPreset(sectionId: FilterSectionId, presetId: string | undefined) {
            const next: Partial<Record<string, string>> = { ...props.modelValue };
            if (presetId === undefined) {
                delete next[sectionId];
            } else {
                next[sectionId] = presetId;
            }
            emit("update:modelValue", next as HealthFilters);
        }

        return {
            t,
            radioGroupId,
            sections: HEALTH_FILTER_SECTIONS,
            activeHealthFilterCount,
            selectPreset,
        };
    },
});
