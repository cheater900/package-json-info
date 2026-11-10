import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { ignoreBrokenPipe } from "../../../src/cli/brokenPipe";

function errorWithCode(code: string) {
    return Object.assign(new Error(code), { code });
}

describe("ignoreBrokenPipe", () => {
    it("ignores EPIPE", () => {
        const stream = new PassThrough();
        ignoreBrokenPipe(stream);

        expect(() => stream.emit("error", errorWithCode("EPIPE"))).not.toThrow();
    });

    it("throws other errors", () => {
        const stream = new PassThrough();
        ignoreBrokenPipe(stream);

        expect(() => stream.emit("error", errorWithCode("EIO"))).toThrow("EIO");
    });
});
