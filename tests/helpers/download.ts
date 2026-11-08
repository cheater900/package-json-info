import { vi } from "vitest";

/** Object URL every stubbed `URL.createObjectURL` call returns. */
export const STUB_OBJECT_URL = "blob:download";

/** Stubs object URLs and link clicks, so a download saves nothing. */
export function stubDownload() {
    return {
        createObjectURL: vi.spyOn(URL, "createObjectURL").mockReturnValue(STUB_OBJECT_URL),
        revokeObjectURL: vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {}),
        click: vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}),
    };
}
