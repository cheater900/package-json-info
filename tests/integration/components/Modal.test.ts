import { describe, it, expect, afterEach } from "vitest";
import { mount, DOMWrapper } from "@vue/test-utils";
import Modal from "../../../src/components/Modal.vue";

// Teleport moves the modal's DOM out to document.body, detached from
// wrapper.element's own subtree - wrapper.find()/text() can't see it, so
// tests mount with attachTo: document.body and query the real DOM instead.
let wrapper: ReturnType<typeof mount> | null = null;

function mountModal() {
    wrapper = mount(Modal, {
        attachTo: document.body,
        slots: { default: "<p>panel content</p>" },
    });
    return wrapper;
}

/** Wraps a real-DOM query result in VTU's DOMWrapper for .trigger()/.text() convenience. */
function bodyFind(selector: string): DOMWrapper<Element> | null {
    const el = document.body.querySelector(selector);
    return el ? new DOMWrapper(el) : null;
}

afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = "";
    document.body.style.overflow = "";
});

describe("Modal", () => {
    it("renders slot content", () => {
        mountModal();

        expect(document.body.textContent).toContain("panel content");
    });

    it("locks body scroll while mounted, unlocks on unmount", () => {
        const w = mountModal();

        expect(document.body.style.overflow).toBe("hidden");

        w.unmount();
        wrapper = null;

        expect(document.body.style.overflow).toBe("");
    });

    it("emits close on close button click", async () => {
        const w = mountModal();

        await bodyFind(".modal__close")!.trigger("click");

        expect(w.emitted("close")).toBeTruthy();
    });

    it("emits close on backdrop click, not panel", async () => {
        const w = mountModal();

        await bodyFind(".modal")!.trigger("click");

        expect(w.emitted("close")).toBeTruthy();
    });

    it("skips close on click inside panel", async () => {
        const w = mountModal();

        await bodyFind(".modal__panel")!.trigger("click");

        expect(w.emitted("close")).toBeFalsy();
    });

    it("emits close on Escape", async () => {
        const w = mountModal();

        await new DOMWrapper(document.body).trigger("keydown", { key: "Escape" });

        expect(w.emitted("close")).toBeTruthy();
    });
});
