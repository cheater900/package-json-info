import { describe, it, expect } from "vitest";
import { settle } from "../../../../src/core/utils/settle";

describe("settle", () => {
    it("wraps resolved value", async () => {
        expect(await settle(async () => 1)).toEqual({ ok: true, value: 1 });
    });

    it("wraps rejection as error", async () => {
        const error = new Error("boom");

        expect(await settle(() => Promise.reject(error))).toEqual({ ok: false, error });
    });

    it("wraps synchronous throw as error", async () => {
        const error = new Error("sync");

        const result = await settle(() => {
            throw error;
        });

        expect(result).toEqual({ ok: false, error });
    });
});
