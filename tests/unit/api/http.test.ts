import { describe, it, expect, vi } from "vitest";
import { findFirstFound } from "../../../src/api/http";
import { jsonResponse } from "../../helpers/fetchMock";

describe("findFirstFound", () => {
    it("skips 404 candidates, returns first found", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (url: string) => jsonResponse({}, url.endsWith("/b"))),
        );

        const found = await findFirstFound(["a", "b", "c"], (c) => `https://x/${c}`);

        expect(found?.candidate).toBe("b");
    });

    it("returns null when every candidate 404s", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse(null, false)),
        );

        expect(await findFirstFound(["a"], (c) => c)).toBeNull();
    });
});
