export type HttpHeaders = Record<string, string>;

/**
 * GETs a URL and parses the response as JSON.
 * Returns `null` on non-2xx responses; throws only on network failures.
 */
export async function fetchJson<T>(url: string, headers: HttpHeaders = {}): Promise<T | null> {
    const response = await fetch(url, { headers });
    if (!response.ok) {
        return null;
    }
    return response.json() as Promise<T>;
}

/** GETs a URL as text. Throws on non-2xx responses and network failures. */
export async function fetchText(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
    }
    return response.text();
}
