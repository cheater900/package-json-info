import { defineComponent } from "vue";
import { formatCell } from "../utils/dependencyRowFormatting";
import { MISSING_VALUE } from "../constants";

/** One dependency value rendered per its column's `render` kind: link, button, or formatted text. */
export default defineComponent({
    props: {
        column: {
            type: Object,
            required: true,
        },
        dependency: {
            type: Object,
            required: true,
        },
    },
    emits: ["open-source-tree"],
    setup() {
        return { formatCell, MISSING_VALUE };
    },
});
