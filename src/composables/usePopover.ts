import { onMounted, onUnmounted, ref } from "vue";

/**
 * Open state of a dropdown anchored in `rootRef`. Escape closes it and
 * refocuses `triggerRef`; a pointer press outside `rootRef` closes it.
 */
export function usePopover() {
    const isOpen = ref(false);
    const rootRef = ref<HTMLElement | null>(null);
    const triggerRef = ref<HTMLButtonElement | null>(null);

    function onKeydown(event: KeyboardEvent) {
        if (!isOpen.value || event.key !== "Escape") {
            return;
        }
        isOpen.value = false;
        triggerRef.value?.focus();
    }

    function onPointerdown(event: PointerEvent) {
        if (rootRef.value?.contains(event.target as Node)) {
            return;
        }
        isOpen.value = false;
    }

    onMounted(() => {
        window.addEventListener("keydown", onKeydown);
        window.addEventListener("pointerdown", onPointerdown);
    });
    onUnmounted(() => {
        window.removeEventListener("keydown", onKeydown);
        window.removeEventListener("pointerdown", onPointerdown);
    });

    return { isOpen, rootRef, triggerRef };
}
