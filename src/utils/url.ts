const SAFE_LINK_PROTOCOLS = ["http:", "https:"];

/**
 * True for absolute http(s) URLs. Guards links built from third-party data
 * (npm `homepage`, `repository`) against `javascript:` and other schemes.
 */
export function isHttpUrl(value: string | null | undefined): value is string {
    if (!value || !URL.canParse(value)) {
        return false;
    }
    return SAFE_LINK_PROTOCOLS.includes(new URL(value).protocol);
}
