<template>
    <table class="deps">
        <thead>
            <draggable
                tag="tr"
                :list="draggableColumns"
                item-key="key"
                handle=".col-drag-handle"
                :force-fallback="true"
            >
                <template #header>
                    <th :class="{ 'col-centered': isCentered('name') }">
                        <span class="th-inner">
                            <button type="button" class="sort-trigger" @click="toggleSort('name')">
                                <span class="col-label">Name</span>
                                <span class="sort-icons" aria-hidden="true">
                                    <span
                                        class="sort-arrow"
                                        :class="{
                                            'sort-arrow-active': sortDirectionFor('name') === 'asc',
                                        }"
                                    >
                                        ▲
                                    </span>
                                    <span
                                        class="sort-arrow"
                                        :class="{
                                            'sort-arrow-active':
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
                    <th :class="{ 'col-centered': isCentered(col.key) }">
                        <span class="th-inner">
                            <span class="col-drag-handle" aria-hidden="true"></span>
                            <button
                                v-if="col.sortable"
                                type="button"
                                class="sort-trigger"
                                @click="toggleSort(col.key)"
                            >
                                <tooltip :text="titleFor(col)" position="bottom">
                                    <span class="col-label">{{ labelFor(col) }}</span>
                                </tooltip>
                                <span class="sort-icons" aria-hidden="true">
                                    <span
                                        class="sort-arrow"
                                        :class="{
                                            'sort-arrow-active':
                                                sortDirectionFor(col.key) === 'asc',
                                        }"
                                    >
                                        ▲
                                    </span>
                                    <span
                                        class="sort-arrow"
                                        :class="{
                                            'sort-arrow-active':
                                                sortDirectionFor(col.key) === 'desc',
                                        }"
                                    >
                                        ▼
                                    </span>
                                </span>
                            </button>
                            <tooltip v-else :text="titleFor(col)" position="bottom">
                                <span class="col-label">{{ labelFor(col) }}</span>
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
                    class="name-cell"
                    @click.stop="
                        $emit('load-package', {
                            name: dependency.name,
                            version: dependency.version,
                        })
                    "
                >
                    <span class="name-cell-inner">
                        <span class="name-text">{{ dependency.name }}</span>
                        <span class="name-arrow" aria-hidden="true">→</span>
                    </span>
                </td>
                <td
                    v-for="col in orderedVisibleColumns"
                    :key="col.key"
                    :class="{
                        'col-centered': isCentered(col.key),
                        'cell-truncate': col.truncatable,
                        expanded: col.truncatable && isExpanded(dependency.name, col.key),
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
            <tr class="status-row">
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
