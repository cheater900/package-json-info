import { onMounted, onUnmounted, defineComponent } from "vue";
import { t } from "../i18n";
import { lockBodyScroll, unlockBodyScroll } from "../utils/scrollLock";

/** Open while mounted: callers toggle it with v-if. Owns Escape, backdrop click and scroll lock. */
export default defineComponent({
    emits: ["close"],
    setup(_props, { emit }) {
        function close() {
            emit("close");
        }

        function onOverlayClick(event) {
            if (event.target === event.currentTarget) {
                close();
            }
        }

        function onKeydown(event) {
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

        return { t, close, onOverlayClick };
    },
});
