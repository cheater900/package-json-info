import { describe, it, expect } from "vitest";
import { isHttpUrl } from "../../../../src/core/utils/url";

describe("isHttpUrl", () => {
    it("accepts http and https URLs", () => {
        expect(isHttpUrl("https://example.com/x")).toBe(true);
        expect(isHttpUrl("http://example.com")).toBe(true);
    });

    it("rejects javascript and data URLs", () => {
        expect(isHttpUrl("javascript:alert(1)")).toBe(false);
        expect(isHttpUrl("data:text/html,<b>x</b>")).toBe(false);
    });

    it("rejects relative, empty, and missing values", () => {
        expect(isHttpUrl("/relative")).toBe(false);
        expect(isHttpUrl("")).toBe(false);
        expect(isHttpUrl(null)).toBe(false);
    });
});
