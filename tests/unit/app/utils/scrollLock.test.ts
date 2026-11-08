import { afterEach, describe, expect, it } from "vitest";
import { lockBodyScroll, unlockBodyScroll } from "../../../../src/app/utils/scrollLock";

afterEach(() => {
    // Drain any lock a failed test left, then reset body.
    for (let i = 0; i < 5; i++) {
        unlockBodyScroll();
    }
});

describe("scrollLock", () => {
    it("hides body overflow while locked, restores on unlock", () => {
        lockBodyScroll();
        expect(document.body.style.overflow).toBe("hidden");

        unlockBodyScroll();

        expect(document.body.style.overflow).toBe("");
    });

    it("keeps body locked until every lock is released", () => {
        lockBodyScroll();
        lockBodyScroll();

        unlockBodyScroll();
        expect(document.body.style.overflow).toBe("hidden");

        unlockBodyScroll();
        expect(document.body.style.overflow).toBe("");
    });

    it("ignores unlock without lock, so next lock still holds", () => {
        unlockBodyScroll();
        lockBodyScroll();
        lockBodyScroll();

        unlockBodyScroll();

        expect(document.body.style.overflow).toBe("hidden");
    });
});
