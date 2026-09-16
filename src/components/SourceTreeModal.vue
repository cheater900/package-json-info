<template>
    <Teleport to="body" :disabled="!isOpen">
        <div v-if="isOpen" class="source-tree-overlay" @click="onOverlayClick">
            <div class="source-tree-panel">
                <div class="source-tree-header">
                    <h3 class="source-tree-title">{{ dependencyName }}</h3>
                    <span v-if="sourceTree" class="source-tree-provider">
                        via {{ sourceTree.provider === "npm" ? "npm" : "GitHub" }}
                    </span>
                    <button
                        type="button"
                        class="close-button"
                        aria-label="Close source tree"
                        @click="close"
                    >
                        ✕
                    </button>
                </div>
                <div class="source-tree-body">
                    <div v-if="loading" class="source-tree-status">Downloading source…</div>
                    <div v-else-if="error" class="source-tree-status source-tree-error">
                        {{ error }}
                    </div>
                    <template v-else>
                        <ul class="file-tree">
                            <file-tree-item
                                v-for="node in tree"
                                :key="node.path"
                                :node="node"
                                :selected-path="selectedPath"
                                @select-file="selectFile"
                            />
                        </ul>
                        <div class="source-tree-viewer">
                            <div v-if="!selectedPath" class="source-tree-status">
                                Select a file to view its contents.
                            </div>
                            <div v-else-if="loadingContent" class="source-tree-status">
                                Loading…
                            </div>
                            <div
                                v-else-if="contentError"
                                class="source-tree-status source-tree-error"
                            >
                                {{ contentError }}
                            </div>
                            <pre v-else class="source-tree-content">{{ selectedContent }}</pre>
                        </div>
                    </template>
                </div>
            </div>
        </div>
    </Teleport>
</template>

<script lang="ts" src="./SourceTreeModal.ts"></script>

<style src="./SourceTreeModal.css"></style>
