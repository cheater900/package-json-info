import { onMounted, onUnmounted, defineComponent, useId } from "vue";
import { t } from "../i18n";
import { lockBodyScroll, unlockBodyScroll } from "../utils/scrollLock";
import IconCross from "./IconCross.vue";

/**
 * Open while mounted: callers toggle it with v-if. Owns Escape, backdrop
 * click and scroll lock. Shows `title` centered on top, close button on the
 * right, and its slot below.
 */
export default defineComponent({
    components: { IconCross },
    props: {
        title: {
            type: String,
            required: true,
        },
    },
    emits: ["close"],
    setup(_props, { emit }) {
        const titleId = useId();

        function close() {
            emit("close");
        }

        function onOverlayClick(event: MouseEvent) {
            if (event.target === event.currentTarget) {
                close();
            }
        }

        function onKeydown(event: KeyboardEvent) {
            if (event.key === "Escape") {
                close();
            }
        }

        onMounted(() => {
            window.addEventListener("keydown", onKeydown);
            lockBodyScroll();
        });
        onUnmounted(() => {
            window.removeEventListener("keydown", onKeydown);
            unlockBodyScroll();
        });

        return { t, titleId, close, onOverlayClick };
    },
});
