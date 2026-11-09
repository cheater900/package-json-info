<template>
    <Transition
        name="collapse"
        @before-enter="collapseHeight"
        @enter="pinHeight"
        @after-enter="clearHeight"
        @enter-cancelled="clearHeight"
        @before-leave="pinHeight"
        @leave="collapseHeight"
        @after-leave="clearHeight"
        @leave-cancelled="clearHeight"
    >
        <slot />
    </Transition>
</template>

<script lang="ts" src="./CollapseTransition.ts"></script>

<style src="./CollapseTransition.css"></style>
