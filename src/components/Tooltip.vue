<template>
    <span
        ref="wrapperRef"
        class="tooltip-wrapper"
        @mouseenter="show"
        @mouseleave="hide"
        @focusin="show"
        @focusout="hide"
    >
        <slot />
    </span>
    <Teleport to="body">
        <span
            v-if="visible && text"
            class="tooltip-bubble"
            :class="`tooltip-${position}`"
            :style="{ left: `${coords.left}px`, top: `${coords.top}px` }"
            role="tooltip"
        >
            {{ text }}
        </span>
    </Teleport>
</template>

<script lang="ts" src="./Tooltip.ts"></script>

<style src="./Tooltip.css"></style>
