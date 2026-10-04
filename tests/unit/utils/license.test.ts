import { describe, it, expect } from "vitest";
import { isCopyleftLicense, hasLicenseWarning } from "../../../src/utils/license";

describe("isCopyleftLicense", () => {
    it("flags GPL-family SPDX identifiers", () => {
        expect(isCopyleftLicense("GPL-3.0")).toBe(true);
        expect(isCopyleftLicense("GPL-3.0-or-later")).toBe(true);
        expect(isCopyleftLicense("AGPL-3.0")).toBe(true);
        expect(isCopyleftLicense("LGPL-2.1")).toBe(true);
        expect(isCopyleftLicense("MPL-2.0")).toBe(true);
    });

    it("is case-insensitive", () => {
        expect(isCopyleftLicense("gpl-3.0")).toBe(true);
    });

    it("skips flag for permissive licenses", () => {
        expect(isCopyleftLicense("MIT")).toBe(false);
        expect(isCopyleftLicense("Apache-2.0")).toBe(false);
        expect(isCopyleftLicense("BSD-3-Clause")).toBe(false);
        expect(isCopyleftLicense("ISC")).toBe(false);
    });

    it("skips flag for missing license", () => {
        expect(isCopyleftLicense(null)).toBe(false);
        expect(isCopyleftLicense(undefined)).toBe(false);
        expect(isCopyleftLicense("")).toBe(false);
    });
});

describe("hasLicenseWarning", () => {
    it("warns on missing license", () => {
        expect(hasLicenseWarning(null)).toBe(true);
        expect(hasLicenseWarning(undefined)).toBe(true);
        expect(hasLicenseWarning("")).toBe(true);
    });

    it("warns on copyleft license", () => {
        expect(hasLicenseWarning("GPL-3.0")).toBe(true);
    });

    it("skips warning for permissive license", () => {
        expect(hasLicenseWarning("MIT")).toBe(false);
    });
});
