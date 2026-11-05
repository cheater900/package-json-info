<template>
    <div class="package-summary">
        <p v-if="dependency.error" class="package-summary__error" role="alert">
            {{ t("table.rowError", { error: dependency.error }) }}
        </p>
        <p v-if="dependency.staleSince" class="package-summary__stale">
            {{ fmtStaleNote(dependency.staleSince) }}
        </p>
        <dl class="package-summary__list">
            <template v-for="col in summaryColumns" :key="col.key">
                <dt>
                    <component :is="COLUMN_ICONS[col.key]" />
                    {{ col.label }}
                </dt>
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
