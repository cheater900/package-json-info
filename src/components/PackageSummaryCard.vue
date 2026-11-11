<template>
    <div class="package-summary">
        <h3 class="package-summary__name">{{ dependency.name }}</h3>
        <p v-if="dependency.error" class="package-summary__error" role="alert">
            {{ t("table.rowError", { error: dependency.error }) }}
        </p>
        <p v-if="dependency.staleSince" class="package-summary__stale">
            {{ fmtStaleNote(dependency.staleSince) }}
        </p>
        <button
            v-if="canRetry"
            type="button"
            class="package-summary__retry"
            :disabled="isRetrying"
            @click="$emit('retry-package', { name: dependency.name, version: dependency.version })"
        >
            {{ t("table.retry") }} {{ t("table.retryLabel", { name: dependency.name }) }}
        </button>
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
