import { z } from "zod";
import { t } from "../i18n";
import type { PackageInput } from "../types";
import type { Settled } from "./settle";

/** Package name -> declared version or range, as in `dependencies`. */
const DependencyMapSchema = z.record(z.string(), z.string(), {
    error: t("validation.dependencyMap"),
});

/**
 * The package.json fields this app reads. Any other field is kept as-is
 * (loose object), so the raw JSON viewer still shows the whole document.
 */
export const PackageJsonSchema = z.looseObject(
    {
        name: z.string({ error: t("validation.string") }).optional(),
        version: z.string({ error: t("validation.string") }).optional(),
        dependencies: DependencyMapSchema.optional(),
        devDependencies: DependencyMapSchema.optional(),
    },
    { error: t("validation.object") },
);

/** One line per issue, prefixed with the offending field path when there is one. */
export function formatPackageJsonError(error: z.ZodError): string {
    return error.issues
        .map((issue) => {
            const path = issue.path.join(".");
            return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join("; ");
}

/** Parsed + validated package.json `text`, or the error to show for it. */
export function parsePackageJsonText(text: string): Settled<PackageJson> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        const message = t("errors.invalidJson", { message: (err as SyntaxError).message });
        return { ok: false, error: new Error(message) };
    }
    const result = PackageJsonSchema.safeParse(parsed);
    if (!result.success) {
        const details = formatPackageJsonError(result.error);
        return { ok: false, error: new Error(t("errors.invalidPackageJson", { details })) };
    }
    return { ok: true, value: result.data };
}

/** Name + version range of each entry of a `dependencies`-style map. */
export function toPackageInputs(dependencies: DependencyMap | undefined): PackageInput[] {
    return Object.entries(dependencies ?? {}).map(([name, version]) => ({ name, version }));
}

export type DependencyMap = z.infer<typeof DependencyMapSchema>;

export type PackageJson = z.infer<typeof PackageJsonSchema>;
