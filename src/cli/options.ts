import { parseArgs } from "node:util";
import {
    ENV_FETCH_CONCURRENCY,
    ENV_FETCH_TIMEOUT_MS,
    ENV_GITHUB_TOKEN,
    ENV_PROXY_URL,
} from "./coreBinding";
import type { CoreSettingsInput } from "./coreBinding";
import { EXPORTERS } from "../core/export";
import type { Exporter } from "../core/export/types";

/** Parsed command line. */
export type CliOptions = CoreSettingsInput & {
    source: string;
    includeDev: boolean;
    /** Export to a file instead of printing. */
    exporter?: Exporter;
    /** Report kind. */
    report?: string;
    /** Target file of `exporter` or a pdf `report`. */
    output?: string;
};

type OutputOptions = Pick<CliOptions, "exporter" | "report" | "output">;

const ARGS_CONFIG = {
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
} as const;

const EXPORTER_IDS = EXPORTERS.map((exporter) => exporter.id).join(", ");
const REPORT_KINDS = ["md", "pdf"];

export const USAGE = `Usage: package-json-info <source> [--no-dev] [--format <id> | --report <md|pdf>]
                         [--output <file>] [--proxy-url <url>] [--timeout <ms>]
                         [--concurrency <n>] [--no-cache] [-h|--help]

Print dependency tables of a package.json as Markdown, or export them to a file.

<source>  package.json file or its directory, http(s) URL (repo URLs resolve to their
          package.json) or npm package spec (name or name@version)

Options:
  --no-dev             Skip devDependencies
  --format <id>        Export to a file instead of printing (${EXPORTER_IDS})
  --report <kind>      Print a Markdown report (md) or write a PDF report (pdf)
  --output <file>      Target file of --format or --report pdf
                       (default: <package>-dependencies.<ext> or <package>-report.pdf)
  --proxy-url <url>    CORS proxy template; {url} marks the target URL
  --timeout <ms>       Request timeout in milliseconds
  --concurrency <n>    Parallel requests
  --no-cache           Skip offline cache of last good lookups
  -h, --help           Show this help

Environment (a flag wins over its variable):
  ${ENV_PROXY_URL}          Same as --proxy-url
  ${ENV_FETCH_TIMEOUT_MS}   Same as --timeout
  ${ENV_FETCH_CONCURRENCY}  Same as --concurrency
  ${ENV_GITHUB_TOKEN}           GitHub token for higher API limits (env only)
  XDG_CACHE_HOME         Cache base dir (default ~/.cache); cache in package-json-info/
`;

/** Options, or the message why the arguments are invalid; null for --help. */
export function parseOptions(argv: string[]): CliOptions | string | null {
    let parsed: ReturnType<typeof parseArgs<typeof ARGS_CONFIG>>;
    try {
        parsed = parseArgs({ ...ARGS_CONFIG, args: argv });
    } catch (error) {
        // parseArgs throws on unknown flags; its message names the flag.
        return (error as Error).message;
    }
    if (parsed.values.help) {
        return null;
    }
    if (parsed.positionals.length !== 1) {
        return "Expected exactly one <source>.";
    }
    const { format, report, output, dev } = parsed.values;
    const outputOptions = parseOutputOptions(format, report, output);
    if (typeof outputOptions === "string") {
        return outputOptions;
    }
    return {
        source: parsed.positionals[0],
        includeDev: dev,
        ...outputOptions,
        proxyUrl: parsed.values["proxy-url"],
        timeout: parsed.values.timeout,
        concurrency: parsed.values.concurrency,
        cache: parsed.values.cache,
    };
}

/** Export options, or the message why the export flags conflict or hold an unknown value. */
function parseOutputOptions(
    format: string | undefined,
    report: string | undefined,
    output: string | undefined,
): OutputOptions | string {
    if (format !== undefined && report !== undefined) {
        return "--format and --report cannot be combined.";
    }
    const exporter = EXPORTERS.find((candidate) => candidate.id === format);
    if (format !== undefined && exporter === undefined) {
        return `Unknown format "${format}". Valid formats: ${EXPORTER_IDS}.`;
    }
    if (report !== undefined && !REPORT_KINDS.includes(report)) {
        return `Unknown report "${report}". Valid reports: ${REPORT_KINDS.join(", ")}.`;
    }
    const writesFile = exporter !== undefined || report === "pdf";
    if (output !== undefined && !writesFile) {
        return "--output needs --format or --report pdf.";
    }
    return { exporter, report, output };
}
