import { describe, it, expect } from "vitest";
import {
    hrefWithInputUrlParam,
    readInputUrlParam,
    withInputUrlParam,
} from "../../../../src/app/utils/urlInputSync";

describe("readInputUrlParam", () => {
    it("reads and decodes inputUrl param", () => {
        expect(readInputUrlParam("?inputUrl=https%3A%2F%2Fexample.com%2Fpackage.json")).toBe(
            "https://example.com/package.json",
        );
    });

    it("returns empty string without param", () => {
        expect(readInputUrlParam("")).toBe("");
        expect(readInputUrlParam("?other=1")).toBe("");
    });

    it("ignores other query params", () => {
        expect(readInputUrlParam("?foo=bar&inputUrl=https://example.com&baz=qux")).toBe(
            "https://example.com",
        );
    });
});

describe("withInputUrlParam", () => {
    it("adds param to empty search string", () => {
        expect(withInputUrlParam("", "https://example.com")).toBe(
            "?inputUrl=https%3A%2F%2Fexample.com",
        );
    });

    it("replaces existing inputUrl value", () => {
        expect(withInputUrlParam("?inputUrl=old-value", "https://example.com")).toBe(
            "?inputUrl=https%3A%2F%2Fexample.com",
        );
    });

    it("removes param for empty value", () => {
        expect(withInputUrlParam("?inputUrl=https://example.com", "")).toBe("");
    });

    it("returns empty string for empty search and value", () => {
        expect(withInputUrlParam("", "")).toBe("");
    });

    it("preserves other query params", () => {
        expect(withInputUrlParam("?foo=bar", "https://example.com")).toBe(
            "?foo=bar&inputUrl=https%3A%2F%2Fexample.com",
        );
    });

    it("preserves other query params on clearing inputUrl", () => {
        expect(withInputUrlParam("?foo=bar&inputUrl=https://example.com", "")).toBe("?foo=bar");
    });
});

describe("hrefWithInputUrlParam", () => {
    it("keeps path, other params, hash", () => {
        expect(
            hrefWithInputUrlParam("https://h.example/app/?foo=bar#top", "https://a.example"),
        ).toBe("https://h.example/app/?foo=bar&inputUrl=https%3A%2F%2Fa.example#top");
    });

    it("drops query for empty value", () => {
        expect(hrefWithInputUrlParam("https://h.example/app/?inputUrl=x#top", "")).toBe(
            "https://h.example/app/#top",
        );
    });

    it("stays on same origin under path starting with //", () => {
        const href = hrefWithInputUrlParam("https://h.example//app/", "https://a.example");

        expect(href).toBe("https://h.example//app/?inputUrl=https%3A%2F%2Fa.example");
        expect(new URL(href).origin).toBe("https://h.example");
    });
});
