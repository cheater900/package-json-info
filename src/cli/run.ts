import { readFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { parseArgs } from "node:util";
import { fetchPackagesInfo } from "../core/api/npmPackage";
import { fetchDependencySource, fetchUrlSource } from "../core/api/packageJsonSource";
import type { LoadedSource } from "../core/api/packageJsonSource";
import { buildExportDocument } from "../core/export/buildExportDocument";
import type { ExportTableInput } from "../core/export/buildExportDocument";
import { markdownExporter } from "../core/export/exporters/markdown";
import { t } from "../core/i18n";
import { splitNameAndRange } from "../core/utils/npmSpec";
import {
    PackageJsonSchema,
    formatPackageJsonError,
    toPackageInputs,
} from "../core/utils/packageJson";
import type { DependencyMap, PackageJson } from "../core/utils/packageJson";
import { settle } from "../core/utils/settle";
import { DEFAULT_COLUMN_ORDER, DEFAULT_VISIBLE_COLUMNS } from "../core/utils/tableColumns";
import { isHttpUrl } from "../core/utils/url";

/** Output streams; injectable so tests capture what the CLI prints. */
export type CliIo = {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
};

/** Parsed command line. */
export type CliOptions = {
    source: string;
    includeDev: boolean;
};

export const EXIT_OK = 0;
export const EXIT_LOAD_FAILURE = 1;
export const EXIT_BAD_ARGUMENTS = 2;

export const USAGE = `Usage: package-json-info <source> [--no-dev] [-h|--help]

Print dependency tables of a package.json as Markdown.

<source>  package.json file path, http(s) URL (repo URLs resolve to their
          package.json) or npm package spec (name or name@version)

Options:
  --no-dev    Skip devDependencies
  -h, --help  Show this help
`;

const USAGE_HINT = 'Run "package-json-info --help" for usage.\n';

const COLUMN_KEYS = DEFAULT_COLUMN_ORDER.filter((key) => DEFAULT_VISIBLE_COLUMNS.has(key));

/** Options, or the message why the arguments are invalid; null for --help. */
function parseOptions(argv: string[]): CliOptions | string | null {
    const parsed = settleSync(() =>
        parseArgs({
            args: argv,
            allowPositionals: true,
            allowNegative: true,
            options: {
                dev: { type: "boolean", default: true },
                help: { type: "boolean", short: "h", default: false },
            },
        }),
    );
    if (typeof parsed === "string") {
        return parsed;
    }
    if (parsed.values.help) {
        return null;
    }
    if (parsed.positionals.length !== 1) {
        return "Expected exactly one <source>.";
    }
    return { source: parsed.positionals[0], includeDev: parsed.values.dev };
}

/** parseArgs throws on unknown flags; its message names the flag. */
function settleSync<T>(task: () => T): T | string {
    try {
        return task();
    } catch (error) {
        return (error as Error).message;
    }
}

/** Reads `text` from `load`; a null source becomes an error naming what was not found. */
async function textOf(load: Promise<LoadedSource | null>, notFoundMessage: string) {
    const source = await load;
    if (source == null) {
        throw new Error(notFoundMessage);
    }
    return source.text;
}

/** Existing file path -> file, http(s) URL -> URL, anything else -> npm spec. */
function readSource(source: string): Promise<string> {
    if (statSync(source, { throwIfNoEntry: false })?.isFile()) {
        return readFile(source, "utf8");
    }
    if (isHttpUrl(source)) {
        return textOf(fetchUrlSource(source), t("errors.urlNotFound"));
    }
    const { name, range } = splitNameAndRange(source) ?? { name: source, range: "" };
    return textOf(
        fetchDependencySource({ name, version: range }),
        t("errors.dependencyNotFound", { name }),
    );
}

function parsePackageJson(text: string): PackageJson {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        throw new Error(t("errors.invalidJson", { message: (err as SyntaxError).message }));
    }
    const result = PackageJsonSchema.safeParse(parsed);
    if (!result.success) {
        throw new Error(
            t("errors.invalidPackageJson", { details: formatPackageJsonError(result.error) }),
        );
    }
    return result.data;
}

/** One table per dependency list, fetched one list at a time to honor fetchConcurrency. */
async function fetchTables(pkg: PackageJson, options: CliOptions): Promise<ExportTableInput[]> {
    const lists: [string, DependencyMap | undefined][] = [[t("sections.deps"), pkg.dependencies]];
    if (options.includeDev) {
        lists.push([t("sections.devDeps"), pkg.devDependencies]);
    }
    const tables: ExportTableInput[] = [];
    for (const [title, dependencies] of lists) {
        const rows = await fetchPackagesInfo(toPackageInputs(dependencies), {
            rootPackage: pkg.name ?? null,
            visibleColumns: DEFAULT_VISIBLE_COLUMNS,
        });
        // Null only once `isCancelled` stops a fetch; none is passed.
        tables.push({ title, dependencies: rows! });
    }
    return tables;
}

async function printTables(options: CliOptions): Promise<string> {
    const pkg = parsePackageJson(await readSource(options.source));
    const tables = await fetchTables(pkg, options);
    const document = buildExportDocument(pkg.name || t("export.untitled"), tables, COLUMN_KEYS);
    const blob = await markdownExporter.render(document);
    return blob.text();
}

/** Runs the CLI on `argv` (arguments after the script path); resolves to the exit code. */
export async function run(argv: string[], io: CliIo): Promise<number> {
    const options = parseOptions(argv);
    if (options === null) {
        io.stdout(USAGE);
        return EXIT_OK;
    }
    if (typeof options === "string") {
        io.stderr(`${options}\n${USAGE_HINT}`);
        return EXIT_BAD_ARGUMENTS;
    }
    const output = await settle(() => printTables(options));
    if (!output.ok) {
        io.stderr(`${output.error.message}\n`);
        return EXIT_LOAD_FAILURE;
    }
    io.stdout(output.value);
    return EXIT_OK;
}
