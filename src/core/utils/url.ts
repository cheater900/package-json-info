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

/**
 * True for "" (no proxy) or an http(s) URL without "user:pass@": fetch
 * rejects such URLs and its error message echoes the credentials.
 */
export function isProxyUrl(value: string): boolean {
    if (value === "") {
        return true;
    }
    if (!isHttpUrl(value)) {
        return false;
    }
    const { username, password } = new URL(value);
    return !username && !password;
}
