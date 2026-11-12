<template>
    <div class="export-menu" role="group" :aria-label="t('export.groupLabel')">
        <span class="export-menu__label" aria-hidden="true">{{ t("export.label") }}</span>
        <button
            v-for="exporter in EXPORTERS"
            :key="exporter.id"
            type="button"
            :disabled="disabled || isExporting"
            @click="exportAs(exporter)"
        >
            {{ exporter.label }}
        </button>
        <span v-if="hasFailed" class="export-menu__error" role="alert">
            {{ t("export.failed") }}
        </span>
    </div>
</template>

<script lang="ts" src="./ExportMenu.ts"></script>

<style src="./ExportMenu.css"></style>
