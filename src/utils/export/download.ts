/** Firefox drops a download whose object URL is revoked in the same task as the click. */
const REVOKE_DELAY_MS = 100;

/** Saves `blob` as `fileName` through a temporary object URL and `<a download>`. */
export function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
