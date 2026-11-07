<template>
    <div class="report-dialog">
        <article class="report-dialog__body">
            <template v-for="(block, index) in report.blocks" :key="index">
                <component
                    :is="headingTag(block.level)"
                    v-if="block.kind === 'heading'"
                    class="report-dialog__heading"
                >
                    {{ block.text }}
                </component>
                <p v-else-if="block.kind === 'paragraph'">{{ block.text }}</p>
                <ul v-else-if="block.kind === 'list'">
                    <li v-for="(item, itemIndex) in block.items" :key="itemIndex">{{ item }}</li>
                </ul>
                <div v-else class="report-dialog__scroll">
                    <table class="report-dialog__table">
                        <thead>
                            <tr>
                                <th
                                    v-for="(header, headerIndex) in block.headers"
                                    :key="headerIndex"
                                >
                                    {{ header }}
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="(row, rowIndex) in block.rows" :key="rowIndex">
                                <td v-for="(cell, cellIndex) in row" :key="cellIndex">
                                    {{ cell }}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </template>
        </article>
        <footer class="report-dialog__actions">
            <span v-if="hasFailed" class="report-dialog__error" role="alert">
                {{ t("report.failed") }}
            </span>
            <button type="button" @click="exportMarkdown">
                <icon-download class="btn-icon" />
                {{ t("report.exportMarkdown") }}
            </button>
            <button type="button" :disabled="isExporting" @click="exportPdf">
                <icon-download class="btn-icon" />
                {{ t("report.exportPdf") }}
            </button>
        </footer>
    </div>
</template>

<script lang="ts" src="./ReportDialog.ts"></script>

<style src="./ReportDialog.css"></style>
