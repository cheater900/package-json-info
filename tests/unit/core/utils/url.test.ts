import { describe, it, expect } from "vitest";
import { isHttpUrl, isProxyUrl } from "../../../../src/core/utils/url";

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

describe("isProxyUrl", () => {
    it.each(["", "https://p.test/?u={url}"])("accepts %j", (value) => {
        expect(isProxyUrl(value)).toBe(true);
    });

    it.each([
        "javascript:alert(1)",
        "https://u:p@p.test/",
        "https://u@p.test/",
        "https://:p@p.test/",
    ])("rejects %j", (value) => {
        expect(isProxyUrl(value)).toBe(false);
    });
});
