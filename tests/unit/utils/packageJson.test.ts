import { describe, it, expect } from "vitest";
import {
    PackageJsonSchema,
    formatPackageJsonError,
    toPackageInputs,
} from "../../../src/utils/packageJson";

function errorFor(value: unknown): string {
    const result = PackageJsonSchema.safeParse(value);
    if (result.success) {
        throw new Error("expected validation failure");
    }
    return formatPackageJsonError(result.error);
}

describe("PackageJsonSchema", () => {
    it("accepts empty object", () => {
        expect(PackageJsonSchema.safeParse({}).success).toBe(true);
    });

    it("keeps unknown fields", () => {
        const pkg = { name: "demo", scripts: { test: "vitest" } };
        expect(PackageJsonSchema.parse(pkg)).toEqual(pkg);
    });

    it("rejects non-object JSON", () => {
        expect(errorFor([])).toBe("expected a JSON object");
        expect(errorFor(null)).toBe("expected a JSON object");
    });

    it("rejects non-object dependencies", () => {
        expect(errorFor({ dependencies: ["left-pad"] })).toBe(
            "dependencies: expected an object mapping package names to version strings",
        );
    });

    it("rejects non-string version with field path", () => {
        expect(errorFor({ devDependencies: { vitest: 4 } })).toMatch(/^devDependencies\.vitest: /);
    });

    it("rejects non-string name", () => {
        expect(errorFor({ name: 42 })).toBe("name: expected a string");
    });

    it("joins several issues", () => {
        expect(errorFor({ name: 1, version: 2 })).toBe(
            "name: expected a string; version: expected a string",
        );
    });
});

describe("toPackageInputs", () => {
    it("maps entries to name + version", () => {
        expect(toPackageInputs({ a: "^1.0.0", b: "2.0.0" })).toEqual([
            { name: "a", version: "^1.0.0" },
            { name: "b", version: "2.0.0" },
        ]);
    });

    it("returns empty list for missing map", () => {
        expect(toPackageInputs(undefined)).toEqual([]);
    });
});
