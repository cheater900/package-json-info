<template>
    <div class="package-summary">
        <h3 class="package-summary__name">{{ dependency.name }}</h3>
        <dl class="package-summary__list">
            <template v-for="col in summaryColumns" :key="col.key">
                <dt>{{ col.label }}</dt>
                <dd>
                    <dependency-cell
                        :column="col"
                        :dependency="dependency"
                        @open-source-tree="$emit('open-source-tree', $event)"
                    />
                </dd>
            </template>
        </dl>
    </div>
</template>

<script lang="ts" src="./PackageSummaryCard.ts"></script>

<style src="./PackageSummaryCard.css"></style>
