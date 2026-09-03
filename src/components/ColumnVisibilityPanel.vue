<template>
    <fieldset class="column-visibility-panel">
        <legend class="visually-hidden">Columns</legend>
        <label v-for="col in toggleableColumns" :key="col.key">
            <input
                type="checkbox"
                :checked="visibleColumns.has(col.key)"
                :disabled="wouldViolateMinVisible(visibleColumns, col.key)"
                @change="$emit('toggle-column', col.key)"
            />
            {{ col.label }}
        </label>
    </fieldset>
</template>

<script lang="ts" setup>
import { TOGGLEABLE_COLUMNS, wouldViolateMinVisible } from "../utils/tableColumns";

defineProps({
    visibleColumns: {
        type: Set,
        required: true,
    },
});

defineEmits(["toggle-column"]);

const toggleableColumns = TOGGLEABLE_COLUMNS;
</script>

<style>
.column-visibility-panel {
    margin-bottom: 16px;
    column-count: 1;
    column-gap: 24px;
}

/* Mid-size desktop: two columns of roughly equal item count/height. */
@media (min-width: 700px) {
    .column-visibility-panel {
        column-count: 2;
    }
}

/* Large desktop: three columns of roughly equal item count/height. */
@media (min-width: 1000px) {
    .column-visibility-panel {
        column-count: 3;
    }
}

.column-visibility-panel label {
    display: flex;
    align-items: center;
    gap: 4px;
    white-space: nowrap;
    break-inside: avoid;
}

.visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
}
</style>
