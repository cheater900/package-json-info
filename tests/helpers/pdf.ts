/** Page objects, not the `/Type /Pages` tree root. */
const PDF_PAGE_OBJECT = /\/Type \/Page\b(?!s)/g;

/** PDF file text; built-in fonts write Latin-1 bytes. */
export async function pdfBlobText(blob: Blob): Promise<string> {
    return new TextDecoder("latin1").decode(await blob.arrayBuffer());
}

export function pdfPageCount(pdfText: string): number {
    return pdfText.match(PDF_PAGE_OBJECT)?.length ?? 0;
}
