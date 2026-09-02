import { describe, it, expect } from "vitest";
import { readInputUrlParam, withInputUrlParam } from "../../../src/utils/urlInputSync";

describe("readInputUrlParam", () => {
    it("reads and decodes the inputUrl param", () => {
        expect(readInputUrlParam("?inputUrl=https%3A%2F%2Fexample.com%2Fpackage.json")).toBe(
            "https://example.com/package.json",
        );
    });

    it("returns an empty string when the param is absent", () => {
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
    it("adds the param to an empty search string", () => {
        expect(withInputUrlParam("", "https://example.com")).toBe(
            "?inputUrl=https%3A%2F%2Fexample.com",
        );
    });

    it("replaces an existing inputUrl value", () => {
        expect(withInputUrlParam("?inputUrl=old-value", "https://example.com")).toBe(
            "?inputUrl=https%3A%2F%2Fexample.com",
        );
    });

    it("removes the param entirely when value is empty", () => {
        expect(withInputUrlParam("?inputUrl=https://example.com", "")).toBe("");
    });

    it("returns an empty string when there was nothing and value is empty", () => {
        expect(withInputUrlParam("", "")).toBe("");
    });

    it("preserves other query params", () => {
        expect(withInputUrlParam("?foo=bar", "https://example.com")).toBe(
            "?foo=bar&inputUrl=https%3A%2F%2Fexample.com",
        );
    });

    it("preserves other query params when clearing inputUrl", () => {
        expect(withInputUrlParam("?foo=bar&inputUrl=https://example.com", "")).toBe("?foo=bar");
    });
});
