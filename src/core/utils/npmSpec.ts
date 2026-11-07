import { t } from "../i18n";

/** Where to look a dependency up in the registry, and which range it asks for. */
export type RegistrySpec = {
    registryName: string;
    range: string;
};

const NPM_ALIAS_PREFIX = "npm:";
/** Version "@" search starts past a scope's leading "@" (npm:@scope/pkg@1.0.0). */
const SCOPE_MARKER_LENGTH = "@".length;
/** Empty, "." or "..": URL resolution turns these into an API root, whose answer is not about a package. */
const ROOT_PATH_NAME = /^\.{0,2}$/;

/**
 * Resolves npm alias specs (`"my-alias": "npm:real-pkg@^1.0.0"`) to the
 * real registry package. Other specs pass through unchanged. An alias
 * without a version (`npm:real-pkg`) gets an empty range, meaning latest.
 *
 * @throws When the registry name is empty, "." or "..": npm's downloads
 *         API answers its root path with the total of every package.
 */
export function resolveRegistrySpec(name: string, spec: string): RegistrySpec {
    const resolved = resolveAlias(name, spec);
    if (ROOT_PATH_NAME.test(resolved.registryName)) {
        throw new Error(t("errors.invalidPackageName", { name: resolved.registryName }));
    }
    return resolved;
}

function resolveAlias(name: string, spec: string): RegistrySpec {
    if (!spec.startsWith(NPM_ALIAS_PREFIX)) {
        return { registryName: name, range: spec };
    }
    const aliased = spec.slice(NPM_ALIAS_PREFIX.length);
    const versionSeparator = aliased.indexOf("@", SCOPE_MARKER_LENGTH);
    if (versionSeparator === -1) {
        return { registryName: aliased, range: "" };
    }
    return {
        registryName: aliased.slice(0, versionSeparator),
        range: aliased.slice(versionSeparator + 1),
    };
}
