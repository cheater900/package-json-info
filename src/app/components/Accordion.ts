import { defineComponent, ref } from "vue";
import CollapseTransition from "./CollapseTransition.vue";

/**
 * `<details>` that starts open and slides its body open/closed. A native
 * toggle would hide the body at once, so the summary click is taken over:
 * the details stays open until the body's collapse ends.
 */
export default defineComponent({
    components: { CollapseTransition },
    setup() {
        const isOpen = ref(true);
        const isDetailsOpen = ref(true);

        function toggle() {
            if (isOpen.value) {
                isOpen.value = false;
                return;
            }
            isDetailsOpen.value = true;
            isOpen.value = true;
        }

        return { isOpen, isDetailsOpen, toggle };
    },
});
