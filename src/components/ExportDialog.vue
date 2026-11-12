<template>
    <form class="export-dialog" @submit.prevent="download">
        <h2 class="export-dialog__title">{{ t("export.dialogTitle") }}</h2>
        <fieldset class="export-dialog__section">
            <legend>{{ t("export.tables") }}</legend>
            <label v-for="table in tables" :key="table.id" class="export-dialog__option">
                <input v-model="selectedTableIds" type="checkbox" :value="table.id" />
                {{ table.title }}
            </label>
            <p v-if="selectedTableIds.length === 0" class="export-dialog__hint">
                {{ t("export.noTable") }}
            </p>
        </fieldset>
        <fieldset class="export-dialog__section">
            <legend>{{ t("export.columns") }}</legend>
            <div class="export-dialog__columns">
                <label
                    v-for="column in columnOptions"
                    :key="column.key"
                    class="export-dialog__option"
                >
                    <input v-model="selectedColumnKeys" type="checkbox" :value="column.key" />
                    {{ column.label }}
                    <!-- Same spinner as a table cell waiting for its column. -->
                    <span
                        v-if="isColumnLoading(column.key)"
                        class="dependency-cell--loading"
                        role="status"
                        :aria-label="t('export.loadingColumn')"
                    ></span>
                </label>
            </div>
        </fieldset>
        <label class="export-dialog__format">
            {{ t("export.format") }}
            <select v-model="formatId">
                <option v-for="exporter in EXPORTERS" :key="exporter.id" :value="exporter.id">
                    {{ exporter.label }}
                </option>
            </select>
        </label>
        <div class="export-dialog__actions">
            <span v-if="hasFailed" class="export-dialog__error" role="alert">
                {{ t("export.failed") }}
            </span>
            <button type="submit" :disabled="!canDownload">
                {{ t("export.download") }}
            </button>
        </div>
    </form>
</template>

<script lang="ts" src="./ExportDialog.ts"></script>

<style src="./ExportDialog.css"></style>
