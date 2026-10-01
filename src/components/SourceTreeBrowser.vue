<template>
    <div class="source-tree">
        <div class="source-tree__header">
            <h3 class="source-tree__title">{{ dependencyName }}</h3>
            <span v-if="sourceTree" class="source-tree__provider">
                via {{ sourceTree.provider === "npm" ? "npm" : "GitHub" }}
            </span>
        </div>
        <div class="source-tree__body">
            <div v-if="loading" class="source-tree__status">Downloading source…</div>
            <div v-else-if="error" class="source-tree__status source-tree__status--error">
                {{ error }}
            </div>
            <template v-else>
                <ul class="source-tree__file-tree">
                    <file-tree-item
                        v-for="node in tree"
                        :key="node.path"
                        :node="node"
                        :selected-path="selectedPath"
                        @select-file="selectFile"
                    />
                </ul>
                <div class="source-tree__viewer">
                    <div v-if="!selectedPath" class="source-tree__status">
                        Select a file to view its contents.
                    </div>
                    <div v-else-if="loadingContent" class="source-tree__status">Loading…</div>
                    <div
                        v-else-if="contentError"
                        class="source-tree__status source-tree__status--error"
                    >
                        {{ contentError }}
                    </div>
                    <pre v-else class="source-tree__content">{{ selectedContent }}</pre>
                </div>
            </template>
        </div>
    </div>
</template>

<script lang="ts" src="./SourceTreeBrowser.ts"></script>

<style src="./SourceTreeBrowser.css"></style>
