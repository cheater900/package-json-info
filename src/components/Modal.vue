<template>
    <Teleport to="body">
        <div class="modal-overlay" @click="onOverlayClick">
            <div class="modal-panel">
                <button type="button" class="modal-close" aria-label="Close" @click="close">
                    ✕
                </button>
                <slot />
            </div>
        </div>
    </Teleport>
</template>

<script lang="ts" src="./Modal.ts"></script>

<style src="./Modal.css"></style>
