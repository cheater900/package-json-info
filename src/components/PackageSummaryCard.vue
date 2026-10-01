<template>
    <div class="package-summary">
        <h3 class="package-summary__name">{{ dependency.name }}</h3>
        <dl class="package-summary__list">
            <template v-for="col in summaryColumns" :key="col.key">
                <dt>{{ col.label }}</dt>
                <dd>
                    <template v-if="col.render === 'link'">
                        <a v-if="dependency.sourceCode" :href="dependency.sourceCode">link</a>
                        <template v-else>-</template>
                    </template>
                    <template v-else-if="col.render === 'button'">
                        <button
                            v-if="dependency.sourceTree"
                            type="button"
                            @click="$emit('open-source-tree', dependency)"
                        >
                            View tree
                        </button>
                        <template v-else>-</template>
                    </template>
                    <template v-else>{{ formatCell(col.key, dependency) }}</template>
                </dd>
            </template>
        </dl>
    </div>
</template>

<script lang="ts" src="./PackageSummaryCard.ts"></script>

<style src="./PackageSummaryCard.css"></style>
