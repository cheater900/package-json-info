import { ref, defineComponent } from "vue";

export default defineComponent({
    // Required for the template's self-reference (<file-tree-item> nested
    // inside its own template, for subdirectories) to resolve - Vue's
    // component resolver falls back to a component's own `name` when a tag
    // isn't otherwise registered.
    name: "FileTreeItem",
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
