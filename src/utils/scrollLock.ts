let lockCount = 0;

/**
 * Reference-counted body-scroll lock. Needed because the source-tree modal
 * can open from inside the dependencies table while it's already expanded
 * full-screen - both lock scroll independently, and without counting,
 * closing whichever one closes first would incorrectly re-enable scroll
 * while the other is still open.
 */
export function lockBodyScroll(): void {
    lockCount++;
    document.body.style.overflow = "hidden";
}

export function unlockBodyScroll(): void {
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
        document.body.style.overflow = "";
    }
}
