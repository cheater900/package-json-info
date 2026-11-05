/**
 * Browsers read the object URL after the click returns; Firefox drops a
 * download revoked too soon, and a slow disk or save dialog delays the read.
 * FileSaver.js waits 40 s for the same reason.
 */
const REVOKE_DELAY_MS = 40_000;

/** Saves `blob` as `fileName` through a temporary object URL and `<a download>`. */
export function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
