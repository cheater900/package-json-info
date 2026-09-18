<template>
    <Teleport to="body" :disabled="!isExpanded">
        <div
            class="deps-region"
            :class="{ 'deps-region-modal': isExpanded }"
            @click="onOverlayClick"
        >
            <div class="deps-panel">
                <div class="deps-toolbar">
                    <tooltip :text="isExpanded ? 'Collapse table' : 'Expand table'">
                        <button
                            type="button"
                            class="expand-toggle"
                            :aria-label="isExpanded ? 'Collapse table' : 'Expand table'"
                            @click="toggleExpanded"
                        >
                            {{ isExpanded ? "✕" : "⤢" }}
                        </button>
                    </tooltip>
                </div>
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
                                        <button
                                            type="button"
                                            class="sort-trigger"
                                            @click="toggleSort('name')"
                                        >
                                            <span class="col-label">Name</span>
                                            <span class="sort-icons" aria-hidden="true">
                                                <span
                                                    class="sort-arrow"
                                                    :class="{
                                                        'sort-arrow-active':
                                                            sortDirectionFor('name') === 'asc',
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
                    <tbody>
                        <tr v-if="isLoading">
                            <td :colspan="orderedVisibleColumns.length + 2" class="loading-row">
                                Loading…
                            </td>
                        </tr>
                        <tr v-else v-for="dependency in sortedDependencies" :key="dependency.name">
                            <td :class="{ 'col-centered': isCentered('name') }">
                                {{ dependency.name }}
                            </td>
                            <td
                                v-for="col in orderedVisibleColumns"
                                :key="col.key"
                                :class="{ 'col-centered': isCentered(col.key) }"
                            >
                                <template v-if="col.render === 'link'">
                                    <a v-if="dependency.sourceCode" :href="dependency.sourceCode">
                                        link
                                    </a>
                                    <template v-else>-</template>
                                </template>
                                <template v-else-if="col.render === 'button'">
                                    <button
                                        v-if="dependency.sourceTree"
                                        type="button"
                                        @click="openSourceTree(dependency)"
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
            </div>
        </div>
    </Teleport>

    <source-tree-modal
        :dependency-name="activeSourceTreeDependency?.name ?? null"
        :source-tree="activeSourceTreeDependency?.sourceTree ?? null"
        @close="closeSourceTree"
    />
</template>

<script lang="ts" src="./DependenciesTable.ts"></script>

<style src="./DependenciesTable.css"></style>
