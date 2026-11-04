import { computed, defineComponent, onMounted, onUnmounted, ref, useId } from "vue";
import type { PropType } from "vue";
import { t } from "../i18n";
import { HEALTH_FILTER_SECTIONS, activeHealthFilterCount } from "../utils/healthFilters";
import type { FilterSectionId, HealthFilters } from "../utils/healthFilters";
import IconFilter from "./IconFilter.vue";

/**
 * Filters button opening a dropdown with one radio group per health filter
 * section: "Any" (no filter) first, then the section's presets. Emits a new
 * `HealthFilters` object on each change; "Any" drops the section's key.
 * Escape closes it and refocuses the button; a click outside closes it.
 */
export default defineComponent({
    components: { IconFilter },
    props: {
        modelValue: {
            type: Object as PropType<HealthFilters>,
            required: true,
        },
    },
    emits: ["update:modelValue"],
    setup(props, { emit }) {
        const panelId = useId();
        const isOpen = ref(false);
        const rootRef = ref<HTMLElement | null>(null);
        const triggerRef = ref<HTMLButtonElement | null>(null);
        const activeCount = computed(() => activeHealthFilterCount(props.modelValue));

        function onKeydown(event: KeyboardEvent) {
            if (!isOpen.value || event.key !== "Escape") {
                return;
            }
            isOpen.value = false;
            triggerRef.value?.focus();
        }

        function onPointerdown(event: PointerEvent) {
            if (rootRef.value?.contains(event.target as Node)) {
                return;
            }
            isOpen.value = false;
        }

        onMounted(() => {
            window.addEventListener("keydown", onKeydown);
            window.addEventListener("pointerdown", onPointerdown);
        });
        onUnmounted(() => {
            window.removeEventListener("keydown", onKeydown);
            window.removeEventListener("pointerdown", onPointerdown);
        });

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
            panelId,
            isOpen,
            rootRef,
            triggerRef,
            activeCount,
            sections: HEALTH_FILTER_SECTIONS,
            selectPreset,
        };
    },
});
