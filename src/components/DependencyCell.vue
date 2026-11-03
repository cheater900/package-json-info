<template>
    <span
        v-if="isPending"
        class="dependency-cell dependency-cell--loading"
        role="status"
        :aria-label="t('table.cellLoading')"
    ></span>
    <tooltip
        v-else-if="failedLookupError"
        :text="t('table.lookupFailed', { error: failedLookupError })"
    >
        <span class="dependency-cell dependency-cell--failed" tabindex="0">
            {{ FAILED_VALUE }}
        </span>
    </tooltip>
    <template v-else-if="column.render === 'link'">
        <a
            v-if="dependency.sourceCode"
            class="dependency-cell__source-link"
            :href="dependency.sourceCode"
            :aria-label="t('table.sourceLink')"
            :title="t('table.sourceLink')"
            @click.stop
        >
            <icon-external-link />
        </a>
        <template v-else>{{ MISSING_VALUE }}</template>
    </template>
    <template v-else-if="column.render === 'button'">
        <button
            v-if="dependency.sourceTree"
            type="button"
            @click.stop="$emit('open-source-tree', dependency)"
        >
            <icon-folder-tree class="btn-icon" />
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
    <template v-else-if="column.render === 'license'">
        {{ dependency.license ?? MISSING_VALUE }}
        <span
            v-if="hasLicenseWarning(dependency.license)"
            class="dependency-cell__warning"
            role="img"
            :aria-label="t('table.licenseWarning')"
        >
            <icon-warning />
        </span>
    </template>
    <template v-else>{{ formatCell(column.key, dependency) }}</template>
</template>

<script lang="ts" src="./DependencyCell.ts"></script>

<style src="./DependencyCell.css"></style>
