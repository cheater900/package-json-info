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
                <template #footer>
                    <th :class="{ 'col-centered': isCentered('loadAction') }">
                        <span class="th-inner">Actions</span>
                    </th>
                </template>
            </draggable>
        </thead>
        <tbody v-if="!isLoading && dependencies.length > 0">
            <tr v-for="dependency in sortedDependencies" :key="dependency.name">
                <td :class="{ 'col-centered': isCentered('name') }">
                    {{ dependency.name }}
                </td>
                <td
                    v-for="col in orderedVisibleColumns"
                    :key="col.key"
                    :class="{ 'col-centered': isCentered(col.key) }"
                >
                    <template v-if="col.render === 'link'">
                        <a v-if="dependency.sourceCode" :href="dependency.sourceCode">link</a>
                        <template v-else>-</template>
                    </template>
                    <template v-else-if="col.render === 'button'">
                        <button
                            v-if="dependency.sourceTree"
                            type="button"
                            @click="$emit('open-source-tree', dependency)"
                        >
                            View tree
                        </button>
                        <template v-else>-</template>
                    </template>
                    <template v-else>{{ formatCell(col.key, dependency) }}</template>
                </td>
                <td :class="{ 'col-centered': isCentered('loadAction') }">
                    <button
                        type="button"
                        @click="
                            $emit('load-package', {
                                name: dependency.name,
                                version: dependency.version,
                            })
                        "
                    >
                        VIEW THIS
                    </button>
                </td>
            </tr>
        </tbody>
    </table>
    <div v-if="isLoading" class="status-row">Loading…</div>
    <div v-else-if="dependencies.length === 0" class="status-row">No dependencies</div>
</template>

<script lang="ts" src="./DependenciesTable.ts"></script>

<style src="./DependenciesTable.css"></style>
