import { writeFile } from "node:fs/promises";
import { constants, createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { bindCore } from "./coreBinding";
import { USAGE, parseOptions } from "./options";
import type { CliOptions } from "./options";
import { fetchPackagesInfo } from "../core/api/npmPackage";
import { fetchDependencySource, fetchUrlSource } from "../core/api/packageJsonSource";
import type { LoadedSource } from "../core/api/packageJsonSource";
import { buildExportDocument, exportFileBaseName } from "../core/export/buildExportDocument";
import type { ExportTableInput } from "../core/export/buildExportDocument";
import { markdownExporter } from "../core/export/exporters/markdown";
import { t } from "../core/i18n";
import { REPORT_COLUMN_KEYS, buildReport, reportFileBaseName } from "../core/report/buildReport";
import { renderReportMarkdown } from "../core/report/renderMarkdown";
import { renderReportPdf } from "../core/report/renderPdf";
import type { DependencyListId } from "../core/types";
import { splitNameAndRange } from "../core/utils/npmSpec";
import { readSourceStreamText } from "../core/utils/bytes";
import { parsePackageJsonText, toPackageInputs } from "../core/utils/packageJson";
import type { DependencyMap, PackageJson } from "../core/utils/packageJson";
import { settle } from "../core/utils/settle";
import { DEFAULT_COLUMN_ORDER, DEFAULT_VISIBLE_COLUMNS } from "../core/utils/tableColumns";
import { isHttpUrl } from "../core/utils/url";

/** Output streams; injectable so tests capture what the CLI prints. */
export type CliIo = {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
};

type CliTable = ExportTableInput & { id: DependencyListId };

/** Id, section title + entries of one package.json dependency list. */
type DependencyList = [
    id: DependencyListId,
    title: string,
    dependencies: DependencyMap | undefined,
];

/** Text to print on stdout and stderr. */
type CliOutput = { stdout: string; stderr: string };

export const EXIT_OK = 0;
export const EXIT_LOAD_FAILURE = 1;
export const EXIT_BAD_ARGUMENTS = 2;

const USAGE_HINT = 'Run "package-json-info --help" for usage.\n';

/**
 * C0 + DEL + C1 control chars but tab and newline. Registry and package.json
 * text is untrusted; raw, its escape sequences could rewrite the terminal
 * (hide lines, set clipboard via OSC 52, spoof links).
 */
// oxlint-disable-next-line no-control-regex
const TERMINAL_CONTROL_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

const COLUMN_KEYS = DEFAULT_COLUMN_ORDER.filter((key) => DEFAULT_VISIBLE_COLUMNS.has(key));

/** Reads `text` from `load`; a null source becomes an error naming what was not found. */
async function textOf(load: Promise<LoadedSource | null>, notFoundMessage: string) {
    const source = await load;
    if (source == null) {
        throw new Error(notFoundMessage);
    }
    return source.text;
}

/**
 * Text of file `path`, capped and BOM-free like a fetched source (see
 * readSourceStreamText). The cast bridges `node:stream/web` and DOM stream
 * types, which differ only in typing: root tsconfig checks the CLI with DOM lib.
 */
function readTextFile(path: string): Promise<string> {
    const stream = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
    return readSourceStreamText(stream);
}

/**
 * Existing dir -> its package.json, other existing path -> file, http(s) URL
 * -> URL, anything else -> npm spec. An existing path never falls through to
 * the npm spec: `my-app/` would load an unrelated registry package of that
 * name, and a pipe (`/dev/stdin`, `<(cat package.json)`) is no regular file.
 */
function readSource(source: string): Promise<string> {
    const stats = statSync(source, { throwIfNoEntry: false });
    if (stats?.isDirectory()) {
        return readTextFile(join(source, "package.json"));
    }
    if (stats) {
        return readTextFile(source);
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
    const lists: DependencyList[] = [["deps", t("sections.deps"), pkg.dependencies]];
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

/**
 * "w" that refuses a symlink as last path part. The default name derives from
 * the untrusted package name, so a hostile repo can plant a symlink under it
 * in the working directory (`app-dependencies.csv -> ~/.ssh/authorized_keys`).
 * Windows lacks O_NOFOLLOW; there 0 keeps plain "w".
 */
const WRITE_NO_FOLLOW_FLAGS =
    constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0);

/**
 * Writes `blob` to `output`, or to `defaultName` in the working directory;
 * returns the path. Only `output`, chosen by the user, may be a symlink.
 */
async function writeOutput(blob: Blob, output: string | undefined, defaultName: string) {
    const data = Buffer.from(await blob.arrayBuffer());
    if (output !== undefined) {
        await writeFile(output, data);
        return output;
    }
    await writeFile(defaultName, data, { flag: WRITE_NO_FOLLOW_FLAGS });
    return defaultName;
}

/** Performs the requested action; resolves to what to print on stdout and stderr. */
async function execute(options: CliOptions): Promise<CliOutput> {
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
    const { exporter } = options;
    if (exporter === undefined) {
        return { stdout: await (await markdownExporter.render(document)).text(), stderr: "" };
    }
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
