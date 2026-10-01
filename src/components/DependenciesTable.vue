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
                                <span class="deps-table__col-label">Name</span>
                                <span class="deps-table__sort-icons" aria-hidden="true">
                                    <span
                                        class="deps-table__sort-arrow"
                                        :class="{
                                            'deps-table__sort-arrow--active':
                                                sortDirectionFor('name') === 'asc',
                                        }"
                                    >
                                        ▲
                                    </span>
                                    <span
                                        class="deps-table__sort-arrow"
                                        :class="{
                                            'deps-table__sort-arrow--active':
                                                sortDirectionFor('name') === 'desc',
                                        }"
                                    >
                                        ▼
                                    </span>
                                </span>
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
                                <span class="deps-table__sort-icons" aria-hidden="true">
                                    <span
                                        class="deps-table__sort-arrow"
                                        :class="{
                                            'deps-table__sort-arrow--active':
                                                sortDirectionFor(col.key) === 'asc',
                                        }"
                                    >
                                        ▲
                                    </span>
                                    <span
                                        class="deps-table__sort-arrow"
                                        :class="{
                                            'deps-table__sort-arrow--active':
                                                sortDirectionFor(col.key) === 'desc',
                                        }"
                                    >
                                        ▼
                                    </span>
                                </span>
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
                    v-for="col in orderedVisibleColumns"
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
                    <template v-if="col.render === 'link'">
                        <a v-if="dependency.sourceCode" :href="dependency.sourceCode" @click.stop>
                            link
                        </a>
                        <template v-else>-</template>
                    </template>
                    <template v-else-if="col.render === 'button'">
                        <button
                            v-if="dependency.sourceTree"
                            type="button"
                            @click.stop="$emit('open-source-tree', dependency)"
                        >
                            View tree
                        </button>
                        <template v-else>-</template>
                    </template>
                    <template v-else>{{ formatCell(col.key, dependency) }}</template>
                </td>
            </tr>
        </tbody>
        <tbody v-else>
            <tr class="deps-table__status-row">
                <td :colspan="orderedVisibleColumns.length + 1">
                    <template v-if="isLoading">Loading…</template>
                    <template v-else>No dependencies</template>
                </td>
            </tr>
        </tbody>
    </table>
</template>

<script lang="ts" src="./DependenciesTable.ts"></script>

<style src="./DependenciesTable.css"></style>
