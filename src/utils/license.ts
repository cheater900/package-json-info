/** npm's license field: a string, `{ type }`, or (in old packages) an array of either. */
export type NpmLicenseField = string | { type?: string } | Array<string | { type?: string }>;

/**
 * SPDX identifier families considered copyleft (or otherwise carrying
 * reciprocal/share-alike obligations worth flagging for review): the GPL
 * family, and the common weak-copyleft licenses.
 */
const COPYLEFT_LICENSE_PATTERN = /(^|-)(gpl|agpl|lgpl|mpl|epl|cddl|osl|eupl|sspl)(-|$|v)/i;

const LICENSE_ALTERNATIVES_SEPARATOR = " OR ";

export function isCopyleftLicense(license: string | null | undefined): boolean {
    if (!license) {
        return false;
    }
    return COPYLEFT_LICENSE_PATTERN.test(license);
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
