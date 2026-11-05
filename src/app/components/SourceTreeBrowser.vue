<template>
    <div class="source-tree">
        <div v-if="sourceTree || truncated" class="source-tree__header">
            <span v-if="sourceTree" class="source-tree__provider">
                {{
                    t("sourceTree.via", {
                        provider: t(`sourceTree.providers.${sourceTree.provider}`),
                    })
                }}
            </span>
            <span v-if="truncated" class="source-tree__notice" role="status">
                {{ t("sourceTree.truncated") }}
            </span>
        </div>
        <div class="source-tree__body">
            <div v-if="loading" class="source-tree__status">
                {{ t("sourceTree.downloading") }}
            </div>
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
                        {{ t("sourceTree.selectFile") }}
                    </div>
                    <div v-else-if="loadingContent" class="source-tree__status">
                        {{ t("sourceTree.loadingFile") }}
                    </div>
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
