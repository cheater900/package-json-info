<template>
    <Teleport to="body">
        <div class="modal" @click="onOverlayClick">
            <div class="modal__panel" role="dialog" aria-modal="true" :aria-labelledby="titleId">
                <header class="modal__header">
                    <h2 :id="titleId" class="modal__title">{{ title }}</h2>
                    <button
                        type="button"
                        class="modal__close"
                        :aria-label="t('modal.close')"
                        @click="close"
                    >
                        <icon-cross />
                    </button>
                </header>
                <slot />
            </div>
        </div>
    </Teleport>
</template>

<script lang="ts" src="./Modal.ts"></script>

<style src="./Modal.css"></style>
