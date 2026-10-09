<template>
    <table class="deps-table">
        <thead>
            <draggable
                tag="tr"
                :list="draggableColumns"
                item-key="key"
                handle=".deps-table__drag-handle"
                :force-fallback="true"
            >
                <template #header>
                    <th :class="{ 'deps-table__centered': isCentered('name') }">
                        <span class="deps-table__th-inner">
                            <button
                                type="button"
                                class="deps-table__sort-trigger"
                                @click="toggleSort('name')"
                            >
                                <span class="deps-table__col-label">{{ t("columns.name") }}</span>
                                <sort-indicator :direction="sortDirectionFor('name')" />
                            </button>
                        </span>
                    </th>
                </template>
                <template #item="{ element: col }">
                    <th :class="{ 'deps-table__centered': isCentered(col.key) }">
                        <span class="deps-table__th-inner">
                            <span class="deps-table__drag-handle" aria-hidden="true"></span>
                            <button
                                v-if="col.sortable"
                                type="button"
                                class="deps-table__sort-trigger"
                                @click="toggleSort(col.key)"
                            >
                                <tooltip :text="titleFor(col)" position="bottom">
                                    <span class="deps-table__col-label">{{ labelFor(col) }}</span>
                                </tooltip>
                                <sort-indicator :direction="sortDirectionFor(col.key)" />
                            </button>
                            <tooltip v-else :text="titleFor(col)" position="bottom">
                                <span class="deps-table__col-label">{{ labelFor(col) }}</span>
                            </tooltip>
                        </span>
                    </th>
                </template>
            </draggable>
        </thead>
        <tbody v-if="!isLoading && dependencies.length > 0">
            <tr
                v-for="dependency in sortedDependencies"
                :key="dependency.name"
                @click="$emit('select-package', dependency)"
            >
                <td
                    class="deps-table__name-cell"
                    @click.stop="
                        $emit('load-package', {
                            name: dependency.name,
                            version: dependency.version,
                        })
                    "
                >
                    <span class="deps-table__name-inner">
                        <span class="deps-table__name-text">{{ dependency.name }}</span>
                        <span class="deps-table__name-arrow" aria-hidden="true">→</span>
                    </span>
                </td>
                <td
                    v-if="dependency.error"
                    class="deps-table__error-cell"
                    role="alert"
                    :colspan="orderedVisibleColumns.length"
                >
                    {{ t("table.rowError", { error: dependency.error }) }}
                </td>
                <td
                    v-for="col in orderedVisibleColumns"
                    v-else
                    :key="col.key"
                    :class="{
                        'deps-table__centered': isCentered(col.key),
                        'deps-table__truncate-cell': col.truncatable,
                        'deps-table__truncate-cell--expanded':
                            col.truncatable && isExpanded(dependency.name, col.key),
                    }"
                    @mouseenter="col.truncatable && onCellMouseEnter($event)"
                    @click="col.truncatable && onCellClick($event, dependency.name, col.key)"
                >
                    <dependency-cell
                        :column="col"
                        :dependency="dependency"
                        @open-source-tree="$emit('open-source-tree', $event)"
                    />
                </td>
            </tr>
        </tbody>
        <tbody v-else>
            <tr class="deps-table__status-row">
                <td :colspan="orderedVisibleColumns.length + 1">
                    <template v-if="isLoading">{{ t("table.loading") }}</template>
                    <template v-else>{{ t("table.empty") }}</template>
                </td>
            </tr>
        </tbody>
    </table>
</template>

<script lang="ts" src="./DependenciesTable.ts"></script>

<style src="./DependenciesTable.css"></style>
