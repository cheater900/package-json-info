<template>
    <li class="file-tree-item">
        <template v-if="node.type === 'directory'">
            <button type="button" class="tree-toggle" @click="expanded = !expanded">
                <span class="tree-icon" aria-hidden="true">{{ expanded ? "▾" : "▸" }}</span>
                {{ node.name }}
            </button>
            <ul v-if="expanded && node.children" class="file-tree-children">
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
            class="tree-file"
            :class="{ 'tree-file-selected': node.path === selectedPath }"
            @click="$emit('select-file', node.path)"
        >
            {{ node.name }}
        </button>
    </li>
</template>

<script lang="ts" src="./FileTreeItem.ts"></script>

<style src="./FileTreeItem.css"></style>
