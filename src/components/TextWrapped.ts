import { computed, defineComponent, ref } from "vue";

/**
 * Clips its content to one line with an ellipsis. Clipped content shows a
 * zoom-in cursor on hover and expands on click; expanded content shows a
 * zoom-out cursor and collapses on click. Content that fits gets neither.
 */
export default defineComponent({
    props: {
        /** Characters shown before clipping; null keeps the CSS default width. */
        maxLength: {
            type: Number,
            default: null,
        },
    },
    setup(props) {
        const rootRef = ref<HTMLElement | null>(null);
        const isExpanded = ref(false);
        const isOverflowing = ref(false);
        // Inline, so only while collapsed: expanded content drops the cap.
        const clipStyle = computed(() =>
            props.maxLength == null || isExpanded.value
                ? undefined
                : { maxWidth: `${props.maxLength}ch` },
        );

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

        return { rootRef, isExpanded, isOverflowing, clipStyle, onMouseEnter, onClick };
    },
});
