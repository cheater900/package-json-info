/** One table: translated headers and cell text, every row as long as `headers`. */
export type ExportSection = {
    title: string;
    headers: string[];
    rows: string[][];
};

/**
 * Format-neutral export input. Exporters read only these strings, never
 * domain rows, i18n or Vue, so each format stays independent.
 */
export type ExportDocument = {
    title: string;
    /** Header of the column naming each row's section, for formats that merge sections into one table. */
    sectionHeader: string;
    sections: ExportSection[];
};

/** One file format. Add a format by adding an exporter to the registry. */
export type Exporter = {
    id: string;
    /** Button text, already translated; the registry sets it so format files stay free of i18n. */
    label: string;
    extension: string;
    mimeType: string;
    render(document: ExportDocument): Blob | Promise<Blob>;
};

/** What a format file provides; the registry adds the translated label. */
export type ExportFormat = Omit<Exporter, "label">;
