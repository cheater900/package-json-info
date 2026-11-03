import en from "./locales/en.json" with { type: "json" };

type MessageTree = { [key: string]: string | MessageTree };

type MessageParams = Record<string, string | number>;

const PLACEHOLDER_PATTERN = /\{(\w+)\}/g;

// ponytail: single locale, add a locale registry + reactive switch when a second language lands
const messages: MessageTree = en;

function lookup(key: string): string | undefined {
    let node: string | MessageTree | undefined = messages;
    for (const part of key.split(".")) {
        if (typeof node !== "object") {
            return undefined;
        }
        node = node[part];
    }
    return typeof node === "string" ? node : undefined;
}

/** Whether a message exists for `key`, for optional messages with a fallback. */
export function hasMessage(key: string): boolean {
    return lookup(key) !== undefined;
}

/**
 * Translates a dotted message key (e.g. "errors.fileRead"), filling
 * `{name}` placeholders from `params`. Unknown keys return the key itself,
 * so a missing message shows up visibly instead of as blank text.
 */
export function t(key: string, params: MessageParams = {}): string {
    const template = lookup(key) ?? key;
    return template.replace(PLACEHOLDER_PATTERN, (placeholder, name) =>
        name in params ? String(params[name]) : placeholder,
    );
}
