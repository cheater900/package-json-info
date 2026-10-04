/**
 * SPDX identifier families considered copyleft (or otherwise carrying
 * reciprocal/share-alike obligations worth flagging for review): the GPL
 * family, and the common weak-copyleft licenses.
 */
const COPYLEFT_LICENSE_PATTERN = /(^|-)(gpl|agpl|lgpl|mpl|epl|cddl|osl|eupl|sspl)(-|$|v)/i;

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
