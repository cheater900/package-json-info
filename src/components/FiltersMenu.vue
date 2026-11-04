<template>
    <div ref="rootRef" class="filters-menu">
        <button
            ref="triggerRef"
            type="button"
            class="filters-menu__trigger"
            :aria-controls="panelId"
            :aria-expanded="isOpen"
            @click="isOpen = !isOpen"
        >
            <icon-filter class="btn-icon" />
            {{ t("filters.open") }}
            <span v-if="activeCount > 0" class="filters-menu__badge">
                <span aria-hidden="true">{{ activeCount }}</span>
                <span class="visually-hidden">
                    {{ t("filters.activeCount", { count: activeCount }) }}
                </span>
            </span>
        </button>

        <div
            v-show="isOpen"
            :id="panelId"
            class="filters-menu__panel"
            role="dialog"
            :aria-label="t('filters.open')"
        >
            <div class="filters-menu__sections">
                <fieldset
                    v-for="section in sections"
                    :key="section.id"
                    class="filters-menu__section"
                >
                    <legend>{{ t(`filters.sections.${section.id}`) }}</legend>
                    <label class="filters-menu__option">
                        <input
                            type="radio"
                            :name="`${panelId}-${section.id}`"
                            :checked="modelValue[section.id] === undefined"
                            @change="selectPreset(section.id, undefined)"
                        />
                        {{ t("filters.any") }}
                    </label>
                    <label
                        v-for="preset in section.presets"
                        :key="preset.id"
                        class="filters-menu__option"
                    >
                        <input
                            type="radio"
                            :name="`${panelId}-${section.id}`"
                            :checked="modelValue[section.id] === preset.id"
                            @change="selectPreset(section.id, preset.id)"
                        />
                        {{ t(`filters.presets.${section.id}.${preset.id}`) }}
                    </label>
                </fieldset>
            </div>
            <button
                type="button"
                class="filters-menu__clear"
                :disabled="activeCount === 0"
                @click="$emit('update:modelValue', {})"
            >
                {{ t("filters.clear") }}
            </button>
        </div>
    </div>
</template>

<script lang="ts" src="./FiltersMenu.ts"></script>

<style src="./FiltersMenu.css"></style>
