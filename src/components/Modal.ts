import { onMounted, onUnmounted, defineComponent } from "vue";
import { lockBodyScroll, unlockBodyScroll } from "../utils/scrollLock";

// Callers control this component's lifecycle with v-if - mounted means
// open, unmounted means closed. That keeps escape/backdrop-click/scroll-lock
// wiring here, instead of duplicated in every modal that used to roll its
// own overlay.
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

        return { close, onOverlayClick };
    },
});
