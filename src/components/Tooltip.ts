import { ref, defineComponent } from "vue";

export default defineComponent({
    name: "Tooltip",
    props: {
        // No bubble is rendered when this is falsy, so wrapping something in
        // a Tooltip with no text is a no-op rather than an empty hover box.
        text: {
            type: String,
            default: "",
        },
        // Bubble is teleported to <body> and positioned in fixed coordinates
        // computed from the trigger's own rect - a plain CSS-anchored bubble
        // would get clipped by any ancestor with overflow-x set (e.g. the
        // horizontally-scrollable deps table forces overflow-y: auto too).
        position: {
            type: String,
            default: "top",
        },
    },
    setup(props) {
        const wrapperRef = ref(null);
        const visible = ref(false);
        const coords = ref({ top: 0, left: 0 });

        function show() {
            if (!props.text || !wrapperRef.value) return;
            const rect = wrapperRef.value.getBoundingClientRect();
            coords.value = {
                left: rect.left + rect.width / 2,
                top: props.position === "bottom" ? rect.bottom + 6 : rect.top - 6,
            };
            visible.value = true;
        }

        function hide() {
            visible.value = false;
        }

        return { wrapperRef, visible, coords, show, hide };
    },
});
