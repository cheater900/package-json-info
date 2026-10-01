<template>
    <Teleport to="body">
        <div class="modal" @click="onOverlayClick">
            <div class="modal__panel">
                <button type="button" class="modal__close" aria-label="Close" @click="close">
                    ✕
                </button>
                <slot />
            </div>
        </div>
    </Teleport>
</template>

<script lang="ts" src="./Modal.ts"></script>

<style src="./Modal.css"></style>
