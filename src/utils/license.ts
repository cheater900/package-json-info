import { z } from "zod";

const NpmLicenseEntrySchema = z.union([z.string(), z.object({ type: z.string().optional() })]);

/** npm's license field: a string, `{ type }`, or (in old packages) an array of either. */
export const NpmLicenseSchema = z.union([NpmLicenseEntrySchema, z.array(NpmLicenseEntrySchema)]);

/**
 * SPDX identifier families considered copyleft (or otherwise carrying
 * reciprocal/share-alike obligations worth flagging for review): the GPL
 * family, and the common weak-copyleft licenses.
 */
const COPYLEFT_LICENSE_PATTERN = /(^|-)(gpl|agpl|lgpl|mpl|epl|cddl|osl|eupl|sspl)(-|$|v)/i;

const LICENSE_ALTERNATIVES_SEPARATOR = " OR ";

/** Heuristic SPDX shape: ids joined by OR / AND / WITH, parentheses ignored. */
const SPDX_EXPRESSION_PATTERN = /^[A-Za-z0-9.+-]+(?: (?:OR|AND|WITH) [A-Za-z0-9.+-]+)*$/;

const LICENSE_FILE_REFERENCE_PREFIX = "SEE LICENSE IN";

const LICENSE_UNLICENSED = "UNLICENSED";

export function isCopyleftLicense(license: string | null | undefined): boolean {
    if (!license) {
        return false;
    }
    return COPYLEFT_LICENSE_PATTERN.test(license);
}

/** True for "SEE LICENSE IN ...", "UNLICENSED", or any string not shaped like an SPDX id or expression. */
export function isCustomLicense(license: string | null): boolean {
    if (!license) {
        return false;
    }
    const trimmed = license.trim();
    if (trimmed.startsWith(LICENSE_FILE_REFERENCE_PREFIX) || trimmed === LICENSE_UNLICENSED) {
        return true;
    }
    const withoutParens = trimmed.replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
    return !SPDX_EXPRESSION_PATTERN.test(withoutParens);
}

/** True when a license is missing, or is a copyleft license worth flagging. */
export function hasLicenseWarning(license: string | null | undefined): boolean {
    return !license || isCopyleftLicense(license);
}

/** Normalises npm's license field into one SPDX-style string. */
export function extractLicense(value: NpmLicenseField | undefined): string | null {
    if (!value) {
        return null;
    }
    if (typeof value === "string") {
        return value;
    }
    if (Array.isArray(value)) {
        const names = value.map(extractLicense).filter((v): v is string => Boolean(v));
        return names.length > 0 ? names.join(LICENSE_ALTERNATIVES_SEPARATOR) : null;
    }
    return value.type ?? null;
}

export type NpmLicenseField = z.infer<typeof NpmLicenseSchema>;
