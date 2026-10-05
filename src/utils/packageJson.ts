import { z } from "zod";

/** Package name -> declared version or range, as in `dependencies`. */
const DependencyMapSchema = z.record(z.string(), z.string(), {
    error: "expected an object mapping package names to version strings",
});

/**
 * The package.json fields this app reads. Any other field is kept as-is
 * (loose object), so the raw JSON viewer still shows the whole document.
 */
export const PackageJsonSchema = z.looseObject(
    {
        name: z.string({ error: "expected a string" }).optional(),
        version: z.string({ error: "expected a string" }).optional(),
        dependencies: DependencyMapSchema.optional(),
        devDependencies: DependencyMapSchema.optional(),
    },
    { error: "expected a JSON object" },
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
