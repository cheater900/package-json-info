import { describe, it, expect, vi } from "vitest";
import { BYTES_PER_KB, BYTES_PER_MB } from "../../../../src/core/constants";
import { formatByteSize, readBytesUpTo } from "../../../../src/core/utils/bytes";

describe("formatByteSize", () => {
    it("shows zero as KB", () => {
        expect(formatByteSize(0)).toBe("0.0 KB");
    });

    it("shows KB with one decimal below 1 MB", () => {
        expect(formatByteSize(1536)).toBe("1.5 KB");
        expect(formatByteSize(BYTES_PER_MB - 1)).toBe("1024.0 KB");
    });

    it("switches to MB at 1 MB", () => {
        expect(formatByteSize(BYTES_PER_MB)).toBe("1.0 MB");
        expect(formatByteSize(2.5 * BYTES_PER_MB + BYTES_PER_KB)).toBe("2.5 MB");
    });
});

describe("readBytesUpTo", () => {
    it("returns every byte up to maxBytes", async () => {
        const stream = new Response(new Uint8Array([1, 2, 3])).body!;

        expect(await readBytesUpTo(stream, 3)).toEqual(new Uint8Array([1, 2, 3]));
    });

    it("returns null + cancels stream past maxBytes", async () => {
        const cancelSource = vi.fn();
        const stream = new ReadableStream<Uint8Array>({
            pull: (controller) => controller.enqueue(new Uint8Array(2)),
            cancel: cancelSource,
        });

        expect(await readBytesUpTo(stream, 3)).toBeNull();
        expect(cancelSource).toHaveBeenCalled();
    });
});
