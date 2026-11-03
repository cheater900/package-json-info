import { INPUT_URL_QUERY_PARAM } from "../constants";

/**
 * Reads the `inputUrl` query param from a `location.search` string (e.g.
 * "?inputUrl=https%3A%2F%2Fexample.com"). Returns an empty string if it's
 * absent, same as an empty text input.
 */
export function readInputUrlParam(search: string): string {
    return new URLSearchParams(search).get(INPUT_URL_QUERY_PARAM) ?? "";
}

/**
 * Returns a new `location.search` string with `inputUrl` set to `value`,
 * or removed entirely when `value` is empty - preserving any other
 * existing query params untouched either way.
 */
export function withInputUrlParam(search: string, value: string): string {
    const params = new URLSearchParams(search);
    if (value) {
        params.set(INPUT_URL_QUERY_PARAM, value);
    } else {
        params.delete(INPUT_URL_QUERY_PARAM);
    }
    const query = params.toString();
    return query ? `?${query}` : "";
}

/**
 * `href` with `inputUrl` set to `value`, as an absolute URL for
 * `history.replaceState`. A relative "path?query" would not do: under a
 * path starting with "//" it names another host, and replaceState throws.
 */
export function hrefWithInputUrlParam(href: string, value: string): string {
    const url = new URL(href);
    url.search = withInputUrlParam(url.search, value);
    return url.href;
}
