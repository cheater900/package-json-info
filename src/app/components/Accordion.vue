<template>
    <details :open="isDetailsOpen">
        <summary @click.prevent="toggle">
            <slot name="summary" />
        </summary>
        <collapse-transition @after-leave="isDetailsOpen = false">
            <div v-show="isOpen">
                <slot />
            </div>
        </collapse-transition>
    </details>
</template>

<script lang="ts" src="./Accordion.ts"></script>
