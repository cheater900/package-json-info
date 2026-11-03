<template>
    <li class="file-tree-item">
        <template v-if="node.type === 'directory'">
            <button type="button" class="file-tree-item__toggle" @click="expanded = !expanded">
                <icon-chevron-right
                    class="file-tree-item__icon"
                    :class="{ 'file-tree-item__icon--expanded': expanded }"
                />
                {{ node.name }}
            </button>
            <ul v-if="expanded && node.children" class="file-tree-item__children">
                <file-tree-item
                    v-for="child in node.children"
                    :key="child.path"
                    :node="child"
                    :selected-path="selectedPath"
                    @select-file="$emit('select-file', $event)"
                />
            </ul>
        </template>
        <button
            v-else
            type="button"
            class="file-tree-item__file"
            :class="{ 'file-tree-item__file--selected': node.path === selectedPath }"
            @click="$emit('select-file', node.path)"
        >
            {{ node.name }}
        </button>
    </li>
</template>

<script lang="ts" src="./FileTreeItem.ts"></script>

<style src="./FileTreeItem.css"></style>
