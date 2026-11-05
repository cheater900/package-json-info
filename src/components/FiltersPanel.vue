<template>
    <div class="filters-panel" role="region" :aria-label="t('filters.open')">
        <div class="filters-panel__sections">
            <fieldset v-for="section in sections" :key="section.id" class="filters-panel__section">
                <legend>{{ t(`filters.sections.${section.id}`) }}</legend>
                <label class="filters-panel__option">
                    <input
                        type="radio"
                        :name="`${radioGroupId}-${section.id}`"
                        :checked="modelValue[section.id] === undefined"
                        @change="selectPreset(section.id, undefined)"
                    />
                    {{ t("filters.any") }}
                </label>
                <label
                    v-for="preset in section.presets"
                    :key="preset.id"
                    class="filters-panel__option"
                >
                    <input
                        type="radio"
                        :name="`${radioGroupId}-${section.id}`"
                        :checked="modelValue[section.id] === preset.id"
                        @change="selectPreset(section.id, preset.id)"
                    />
                    {{ t(`filters.presets.${section.id}.${preset.id}`) }}
                </label>
            </fieldset>
        </div>
        <button
            type="button"
            class="filters-panel__clear"
            :disabled="activeHealthFilterCount(modelValue) === 0"
            @click="$emit('update:modelValue', {})"
        >
            {{ t("filters.clear") }}
        </button>
    </div>
</template>

<script lang="ts" src="./FiltersPanel.ts"></script>

<style src="./FiltersPanel.css"></style>
