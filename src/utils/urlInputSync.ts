const QUERY_PARAM = "inputUrl";

/**
 * Reads the `inputUrl` query param from a `location.search` string (e.g.
 * "?inputUrl=https%3A%2F%2Fexample.com"). Returns an empty string if it's
 * absent, same as an empty text input.
 */
export function readInputUrlParam(search: string): string {
    return new URLSearchParams(search).get(QUERY_PARAM) ?? "";
}

/**
 * Returns a new `location.search` string with `inputUrl` set to `value`,
 * or removed entirely when `value` is empty - preserving any other
 * existing query params untouched either way.
 */
export function withInputUrlParam(search: string, value: string): string {
    const params = new URLSearchParams(search);
    if (value) {
        params.set(QUERY_PARAM, value);
    } else {
        params.delete(QUERY_PARAM);
    }
    const query = params.toString();
    return query ? `?${query}` : "";
}
