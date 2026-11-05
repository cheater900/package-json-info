/** Where to look a dependency up in the registry, and which range it asks for. */
export type RegistrySpec = {
    registryName: string;
    range: string;
};

const NPM_ALIAS_PREFIX = "npm:";
/** Version "@" search starts past a scope's leading "@" (npm:@scope/pkg@1.0.0). */
const SCOPE_MARKER_LENGTH = "@".length;

/**
 * Resolves npm alias specs (`"my-alias": "npm:real-pkg@^1.0.0"`) to the
 * real registry package. Other specs pass through unchanged. An alias
 * without a version (`npm:real-pkg`) gets an empty range, meaning latest.
 */
export function resolveRegistrySpec(name: string, spec: string): RegistrySpec {
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
