import { defineComponent } from "vue";

/**
 * Slides its single slotted element open/closed (toggle it with v-show or
 * v-if). CSS can't transition height to/from `auto`, so the hooks pin it to
 * the measured pixel height while the transition runs, then clear it. Give
 * the slotted element no padding or border: those stay visible at height 0.
 */
export default defineComponent({
    setup() {
        function collapseHeight(el: Element) {
            (el as HTMLElement).style.height = "0";
        }

        // On enter, reading scrollHeight also flushes layout at height 0, so
        // the change to pixels starts the transition.
        function pinHeight(el: Element) {
            (el as HTMLElement).style.height = `${el.scrollHeight}px`;
        }

        function clearHeight(el: Element) {
            (el as HTMLElement).style.height = "";
        }

        return { collapseHeight, pinHeight, clearHeight };
    },
});
