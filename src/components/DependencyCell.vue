<template>
    <template v-if="column.render === 'link'">
        <a v-if="dependency.sourceCode" :href="dependency.sourceCode" @click.stop>link</a>
        <template v-else>{{ MISSING_VALUE }}</template>
    </template>
    <template v-else-if="column.render === 'button'">
        <button
            v-if="dependency.sourceTree"
            type="button"
            @click.stop="$emit('open-source-tree', dependency)"
        >
            View tree
        </button>
        <template v-else>{{ MISSING_VALUE }}</template>
    </template>
    <template v-else>{{ formatCell(column.key, dependency) }}</template>
</template>

<script lang="ts" src="./DependencyCell.ts"></script>
