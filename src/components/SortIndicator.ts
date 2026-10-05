import { defineComponent } from "vue";

export default defineComponent({
    props: {
        /** "asc", "desc", or null when the column isn't the sort key. */
        direction: {
            type: String,
            default: null,
        },
    },
});
