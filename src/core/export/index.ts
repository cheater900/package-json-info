import { t } from "../i18n";
import { csvExporter } from "./exporters/csv";
import { htmlExporter } from "./exporters/html";
import { markdownExporter } from "./exporters/markdown";
import { pdfExporter } from "./exporters/pdf";
import { xlsxExporter } from "./exporters/xlsx";
import type { Exporter } from "./types";

/** Every export format, in button order. A new format is one file plus one line here. */
export const EXPORTERS: readonly Exporter[] = [
    csvExporter,
    xlsxExporter,
    markdownExporter,
    htmlExporter,
    pdfExporter,
].map((format) => ({ ...format, label: t(`export.formats.${format.id}`) }));
