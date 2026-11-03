import { defineComponent } from "vue";
import IconCaretUp from "./IconCaretUp.vue";

export default defineComponent({
    components: { IconCaretUp },
    props: {
        /** "asc", "desc", or null when the column isn't the sort key. */
        direction: {
            type: String,
            default: null,
        },
    },
});
