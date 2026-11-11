<template>
    <template v-if="column.render === 'link'">
        <a v-if="dependency.sourceCode" :href="dependency.sourceCode" @click.stop>
            {{ t("table.sourceLink") }}
        </a>
        <template v-else>{{ MISSING_VALUE }}</template>
    </template>
    <template v-else-if="column.render === 'button'">
        <button
            v-if="dependency.sourceTree"
            type="button"
            @click.stop="$emit('open-source-tree', dependency)"
        >
            {{ t("table.viewTree") }}
        </button>
        <template v-else>{{ MISSING_VALUE }}</template>
    </template>
    <tooltip
        v-else-if="column.render === 'health' && dependency.healthScore != null"
        :text="healthTooltip"
    >
        <span class="health-score" :class="`health-score--${healthBand(dependency.healthScore)}`">
            {{ formatCell(column.key, dependency) }}
        </span>
    </tooltip>
    <template v-else>{{ formatCell(column.key, dependency) }}</template>
</template>

<script lang="ts" src="./DependencyCell.ts"></script>

<style src="./DependencyCell.css"></style>
