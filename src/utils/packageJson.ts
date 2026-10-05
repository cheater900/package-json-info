import { z } from "zod";
import { t } from "../i18n";

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

export type DependencyMap = z.infer<typeof DependencyMapSchema>;

export type PackageJson = z.infer<typeof PackageJsonSchema>;
