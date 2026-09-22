<template>
    <div class="deps-panel">
        <div class="deps-toolbar">
            <button
                type="button"
                class="expand-toggle"
                aria-label="Expand table"
                @click="openExpanded"
            >
                ⤢
            </button>
        </div>
        <dependencies-table-grid
            :ordered-visible-columns="orderedVisibleColumns"
            :draggable-columns="draggableColumns"
            :sorted-dependencies="sortedDependencies"
            :is-loading="isLoading"
            :is-empty="dependencies.length === 0"
            :is-centered="isCentered"
            :label-for="labelFor"
            :title-for="titleFor"
            :sort-direction-for="sortDirectionFor"
            :format-cell="formatCell"
            @toggle-sort="toggleSort"
            @open-source-tree="openSourceTree"
            @load-package="$emit('load-package', $event)"
        />
    </div>

    <modal v-if="isExpanded" @close="closeExpanded">
        <div class="deps-panel deps-panel-expanded">
            <dependencies-table-grid
                :ordered-visible-columns="orderedVisibleColumns"
                :draggable-columns="draggableColumns"
                :sorted-dependencies="sortedDependencies"
                :is-loading="isLoading"
                :is-empty="dependencies.length === 0"
                :is-centered="isCentered"
                :label-for="labelFor"
                :title-for="titleFor"
                :sort-direction-for="sortDirectionFor"
                :format-cell="formatCell"
                @toggle-sort="toggleSort"
                @open-source-tree="openSourceTree"
                @load-package="$emit('load-package', $event)"
            />
        </div>
    </modal>

    <source-tree-modal
        :dependency-name="activeSourceTreeDependency?.name ?? null"
        :source-tree="activeSourceTreeDependency?.sourceTree ?? null"
        @close="closeSourceTree"
    />
</template>

<script lang="ts" src="./DependenciesTable.ts"></script>

<style src="./DependenciesTable.css"></style>
