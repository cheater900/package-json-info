import { ref, defineComponent } from "vue";
import IconChevronRight from "./IconChevronRight.vue";
import IconFile from "./IconFile.vue";
import IconFolder from "./IconFolder.vue";
import IconFolderOpen from "./IconFolderOpen.vue";

export default defineComponent({
    // Required for the template's self-reference (<file-tree-item> nested
    // inside its own template, for subdirectories) to resolve - Vue's
    // component resolver falls back to a component's own `name` when a tag
    // isn't otherwise registered.
    name: "FileTreeItem",
    components: { IconChevronRight, IconFile, IconFolder, IconFolderOpen },
    props: {
        node: {
            type: Object,
            required: true,
        },
        selectedPath: {
            type: String,
            default: null,
        },
    },
    emits: ["select-file"],
    setup() {
        const expanded = ref(false);
        return { expanded };
    },
});
