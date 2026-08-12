<template>
  <fieldset class="column-visibility-panel">
    <legend>Columns</legend>
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
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin-bottom: 16px;
}

.column-visibility-panel label {
  display: flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}
</style>
