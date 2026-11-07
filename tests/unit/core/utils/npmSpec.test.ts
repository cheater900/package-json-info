import { describe, it, expect } from "vitest";
import { resolveRegistrySpec } from "../../../../src/core/utils/npmSpec";

describe("resolveRegistrySpec", () => {
    it("passes plain range through", () => {
        expect(resolveRegistrySpec("vue", "^3.0.0")).toEqual({
            registryName: "vue",
            range: "^3.0.0",
        });
    });

    it("resolves alias to real package and range", () => {
        expect(resolveRegistrySpec("a", "npm:real@^1.2.0")).toEqual({
            registryName: "real",
            range: "^1.2.0",
        });
    });

    it("resolves scoped alias", () => {
        expect(resolveRegistrySpec("a", "npm:@scope/real@1.0.0")).toEqual({
            registryName: "@scope/real",
            range: "1.0.0",
        });
    });

    it("returns empty range for alias without version", () => {
        expect(resolveRegistrySpec("a", "npm:@scope/real")).toEqual({
            registryName: "@scope/real",
            range: "",
        });
    });

    it.each([
        ["", "1.0.0"],
        [".", "1.0.0"],
        ["..", "1.0.0"],
        ["a", "npm:"],
        ["a", "npm:.@1.0.0"],
    ])("throws for root-path registry name %j %j", (name, spec) => {
        expect(() => resolveRegistrySpec(name, spec)).toThrow("not a valid npm package name");
    });
});
