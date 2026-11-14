import { defineComponent, ref } from "vue";

/**
 * Clips its content to one line with an ellipsis. Clipped content shows a
 * zoom-in cursor on hover and expands on click; expanded content shows a
 * zoom-out cursor and collapses on click. Content that fits gets neither.
 */
export default defineComponent({
    setup() {
        const rootRef = ref<HTMLElement | null>(null);
        const isExpanded = ref(false);
        const isOverflowing = ref(false);

        function isClipped(): boolean {
            const el = rootRef.value;
            return el != null && el.scrollWidth > el.clientWidth;
        }

        // Measured on hover: cheap, and most instances are never hovered.
        function onMouseEnter() {
            isOverflowing.value = isClipped();
        }

        // Expanded content always collapses; collapsed content expands only when clipped.
        function onClick() {
            if (!isExpanded.value && !isClipped()) {
                return;
            }
            isExpanded.value = !isExpanded.value;
        }

        return { rootRef, isExpanded, isOverflowing, onMouseEnter, onClick };
    },
});
