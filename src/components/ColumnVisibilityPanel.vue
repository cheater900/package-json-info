<template>
  <fieldset class="column-visibility-panel">
    <legend class="visually-hidden">Columns</legend>
    <label v-for="col in toggleableColumns" :key="col.key">
      <input
        type="checkbox"
        :checked="!hiddenColumns.has(col.key)"
        :disabled="wouldViolateMinVisible(hiddenColumns, col.key)"
        @change="$emit('toggle-column', col.key)"
      />
      {{ col.label }}
    </label>
  </fieldset>
</template>

<script lang="ts" setup>
import { TOGGLEABLE_COLUMNS, wouldViolateMinVisible } from "../utils/tableColumns"

defineProps({
  hiddenColumns: {
    type: Set,
    required: true
  }
})

defineEmits(["toggle-column"])

const toggleableColumns = TOGGLEABLE_COLUMNS
</script>

<style>
.column-visibility-panel {
  margin-bottom: 16px;
}

.column-visibility-panel label {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
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
