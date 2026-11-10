import { readFile } from "node:fs/promises";
import { statSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { bindCore } from "./coreBinding";
import type { CoreSettingsInput } from "./coreBinding";
import { fetchPackagesInfo } from "../core/api/npmPackage";
import { fetchDependencySource, fetchUrlSource } from "../core/api/packageJsonSource";
import type { LoadedSource } from "../core/api/packageJsonSource";
import { buildExportDocument, exportFileBaseName } from "../core/export/buildExportDocument";
import type { ExportTableInput } from "../core/export/buildExportDocument";
import { EXPORTERS } from "../core/export";
import { markdownExporter } from "../core/export/exporters/markdown";
import { t } from "../core/i18n";
import { REPORT_COLUMN_KEYS, buildReport, reportFileBaseName } from "../core/report/buildReport";
import { renderReportMarkdown } from "../core/report/renderMarkdown";
import { renderReportPdf } from "../core/report/renderPdf";
import type { DependencyListId } from "../core/types";
import { splitNameAndRange } from "../core/utils/npmSpec";
import { parsePackageJsonText, toPackageInputs } from "../core/utils/packageJson";
import type { DependencyMap, PackageJson } from "../core/utils/packageJson";
import { settle } from "../core/utils/settle";
import { DEFAULT_COLUMN_ORDER, DEFAULT_VISIBLE_COLUMNS } from "../core/utils/tableColumns";
import { isHttpUrl } from "../core/utils/url";
import { writeBlob } from "./writeBlob";

/** Output streams; injectable so tests capture what the CLI prints. */
export type CliIo = {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
};

/** Parsed command line. */
export type CliOptions = CoreSettingsInput & {
    source: string;
    includeDev: boolean;
    /** Exporter id; export to a file instead of printing. */
    format?: string;
    /** Report kind. */
    report?: string;
    /** Target file of `format` or a pdf `report`. */
    output?: string;
};

type CliTable = ExportTableInput & { id: DependencyListId };

const REPORT_KINDS = ["md", "pdf"];

export const EXIT_OK = 0;
export const EXIT_LOAD_FAILURE = 1;
export const EXIT_BAD_ARGUMENTS = 2;

export const USAGE = `Usage: package-json-info <source> [--no-dev] [--format <id> | --report <md|pdf>]
                         [--output <file>] [--proxy-url <url>] [--timeout <ms>]
                         [--concurrency <n>] [--no-cache] [-h|--help]

Print dependency tables of a package.json as Markdown, or export them to a file.

<source>  package.json file or its directory, http(s) URL (repo URLs resolve to their
          package.json) or npm package spec (name or name@version)

Options:
  --no-dev             Skip devDependencies
  --format <id>        Export to a file instead of printing (${EXPORTERS.map((e) => e.id).join(", ")})
  --report <kind>      Print a Markdown report (md) or write a PDF report (pdf)
  --output <file>      Target file of --format or --report pdf
                       (default: <package>-dependencies.<ext> or <package>-report.pdf)
  --proxy-url <url>    CORS proxy template; {url} marks the target URL
  --timeout <ms>       Request timeout in milliseconds
  --concurrency <n>    Parallel requests
  --no-cache           Skip offline cache of last good lookups
  -h, --help           Show this help

Environment (a flag wins over its variable):
  PJI_PROXY_URL          Same as --proxy-url
  PJI_FETCH_TIMEOUT_MS   Same as --timeout
  PJI_FETCH_CONCURRENCY  Same as --concurrency
  GITHUB_TOKEN           GitHub token for higher API limits (env only)
  XDG_CACHE_HOME         Cache base dir (default ~/.cache); cache in package-json-info/
`;

const USAGE_HINT = 'Run "package-json-info --help" for usage.\n';

/**
 * C0 + DEL + C1 control chars but tab and newline. Registry and package.json
 * text is untrusted; raw, its escape sequences could rewrite the terminal
 * (hide lines, set clipboard via OSC 52, spoof links).
 */
// oxlint-disable-next-line no-control-regex
const TERMINAL_CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

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
                format: { type: "string" },
                report: { type: "string" },
                output: { type: "string" },
                "proxy-url": { type: "string" },
                timeout: { type: "string" },
                concurrency: { type: "string" },
                cache: { type: "boolean", default: true },
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
    const { format, report, output, dev } = parsed.values;
    const problem = validateOutputOptions(format, report, output);
    if (problem) {
        return problem;
    }
    return {
        source: parsed.positionals[0],
        includeDev: dev,
        format,
        report,
        output,
        proxyUrl: parsed.values["proxy-url"],
        timeout: parsed.values.timeout,
        concurrency: parsed.values.concurrency,
        cache: parsed.values.cache,
    };
}

/** Message why the export flags conflict or hold an unknown value; undefined when valid. */
function validateOutputOptions(
    format: string | undefined,
    report: string | undefined,
    output: string | undefined,
): string | undefined {
    if (format !== undefined && report !== undefined) {
        return "--format and --report cannot be combined.";
    }
    if (format !== undefined && !EXPORTERS.some((exporter) => exporter.id === format)) {
        const ids = EXPORTERS.map((exporter) => exporter.id).join(", ");
        return `Unknown format "${format}". Valid formats: ${ids}.`;
    }
    if (report !== undefined && !REPORT_KINDS.includes(report)) {
        return `Unknown report "${report}". Valid reports: ${REPORT_KINDS.join(", ")}.`;
    }
    const writesFile = format !== undefined || report === "pdf";
    if (output !== undefined && !writesFile) {
        return "--output needs --format or --report pdf.";
    }
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

/** UTF-8 text of file `path`; drops a leading BOM, as the web app's `File.text()` does. */
async function readTextFile(path: string): Promise<string> {
    return new TextDecoder().decode(await readFile(path));
}

/**
 * Existing file path -> file, existing dir -> its package.json, http(s) URL
 * -> URL, anything else -> npm spec. A dir never falls through to the npm
 * spec: `my-app/` would load an unrelated registry package of that name.
 */
function readSource(source: string): Promise<string> {
    const stats = statSync(source, { throwIfNoEntry: false });
    if (stats?.isFile()) {
        return readTextFile(source);
    }
    if (stats?.isDirectory()) {
        return readTextFile(join(source, "package.json"));
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

/** One table per dependency list, fetched one list at a time to honor fetchConcurrency. */
async function fetchTables(
    pkg: PackageJson,
    options: CliOptions,
    visibleColumns: ReadonlySet<string>,
): Promise<CliTable[]> {
    const lists: [DependencyListId, string, DependencyMap | undefined][] = [
        ["deps", t("sections.deps"), pkg.dependencies],
    ];
    if (options.includeDev) {
        lists.push(["devDeps", t("sections.devDeps"), pkg.devDependencies]);
    }
    const tables: CliTable[] = [];
    for (const [id, title, dependencies] of lists) {
        const rows = await fetchPackagesInfo(toPackageInputs(dependencies), {
            rootPackage: pkg.name ?? null,
            visibleColumns,
        });
        // Null only once `isCancelled` stops a fetch; none is passed.
        tables.push({ id, title, dependencies: rows! });
    }
    return tables;
}

/** Writes `blob` to `output`, or to `defaultName` in the working directory; returns the path. */
async function writeOutput(blob: Blob, output: string | undefined, defaultName: string) {
    const path = output ?? defaultName;
    await writeBlob(path, blob);
    return path;
}

/** Performs the requested action; resolves to what to print on stdout and stderr. */
async function execute(options: CliOptions): Promise<{ stdout: string; stderr: string }> {
    const parsed = parsePackageJsonText(await readSource(options.source));
    if (!parsed.ok) {
        throw parsed.error;
    }
    const pkg = parsed.value;
    const title = pkg.name || t("export.untitled");
    if (options.report !== undefined) {
        const tables = await fetchTables(pkg, options, new Set(REPORT_COLUMN_KEYS));
        const report = buildReport(
            { title, tables, searchQuery: "", healthFilters: {} },
            new Date(),
        );
        if (options.report === "md") {
            return { stdout: renderReportMarkdown(report), stderr: "" };
        }
        const path = await writeOutput(
            renderReportPdf(report),
            options.output,
            `${reportFileBaseName(title)}.pdf`,
        );
        return { stdout: "", stderr: `${path}\n` };
    }
    const tables = await fetchTables(pkg, options, DEFAULT_VISIBLE_COLUMNS);
    const document = buildExportDocument(title, tables, COLUMN_KEYS);
    if (options.format === undefined) {
        return { stdout: await (await markdownExporter.render(document)).text(), stderr: "" };
    }
    const exporter = EXPORTERS.find((candidate) => candidate.id === options.format)!;
    const path = await writeOutput(
        await exporter.render(document),
        options.output,
        `${exportFileBaseName(title)}.${exporter.extension}`,
    );
    return { stdout: "", stderr: `${path}\n` };
}

/** `io` printing text without terminal control chars. */
function terminalSafeIo(io: CliIo): CliIo {
    return {
        stdout: (text) => io.stdout(text.replace(TERMINAL_CONTROL_CHARS, "")),
        stderr: (text) => io.stderr(text.replace(TERMINAL_CONTROL_CHARS, "")),
    };
}

/** Runs the CLI on `argv` (arguments after the script path); resolves to the exit code. */
export async function run(
    argv: string[],
    rawIo: CliIo,
    env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
    const io = terminalSafeIo(rawIo);
    const options = parseOptions(argv);
    if (options === null) {
        io.stdout(USAGE);
        return EXIT_OK;
    }
    if (typeof options === "string") {
        io.stderr(`${options}\n${USAGE_HINT}`);
        return EXIT_BAD_ARGUMENTS;
    }
    const bound = bindCore(options, env);
    if (typeof bound === "string") {
        io.stderr(`${bound}\n${USAGE_HINT}`);
        return EXIT_BAD_ARGUMENTS;
    }
    const output = await settle(() => execute(options));
    if (!output.ok) {
        io.stderr(`${output.error.message}\n`);
        return EXIT_LOAD_FAILURE;
    }
    io.stdout(output.value.stdout);
    io.stderr(output.value.stderr);
    return EXIT_OK;
}
