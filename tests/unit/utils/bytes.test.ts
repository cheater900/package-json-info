import { describe, it, expect } from "vitest";
import { BYTES_PER_KB, BYTES_PER_MB } from "../../../src/constants";
import { formatByteSize } from "../../../src/utils/bytes";

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
