<template>
    <fieldset class="column-visibility-panel">
        <legend class="visually-hidden">{{ t("sections.columns") }}</legend>
        <label v-for="col in toggleableColumns" :key="col.key">
            <input
                type="checkbox"
                :checked="visibleColumns.has(col.key)"
                :disabled="wouldViolateMinVisible(visibleColumns, col.key)"
                @change="$emit('toggle-column', col.key)"
            />
            <component :is="COLUMN_ICONS[col.key]" class="column-visibility-panel__icon" />
            <span class="column-visibility-panel__name">{{ col.label }}</span>
        </label>
    </fieldset>
</template>

<script lang="ts" src="./ColumnVisibilityPanel.ts"></script>

<style src="./ColumnVisibilityPanel.css"></style>
