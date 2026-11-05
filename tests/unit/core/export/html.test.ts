// @vitest-environment jsdom
// DOMParser checks the rendered markup; the exporter itself needs no DOM.
import { describe, it, expect } from "vitest";
import { htmlExporter } from "../../../../src/core/export/exporters/html";
import { exportDocumentFixture, exportDocumentWith } from "../../../fixtures/exportDocument";

async function renderHtml() {
    const blob = await htmlExporter.render(exportDocumentFixture);
    return { type: blob.type, html: await blob.text() };
}

describe("htmlExporter", () => {
    it("writes standalone page: doctype, inline style, CSP, no script or external link", async () => {
        const { type, html } = await renderHtml();
        expect(type).toBe("text/html;charset=utf-8");
        expect(html.startsWith("<!doctype html>")).toBe(true);
        expect(html).toContain("<style>");
        expect(html).not.toMatch(/<script|<link|src=|href=/i);
        expect(html).toContain(
            `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`,
        );
    });

    it("escapes cell text", async () => {
        const { html } = await renderHtml();
        expect(html).toContain("<td>&lt;b&gt;&amp;&lt;/b&gt;</td>");
        expect(html).toContain("<td>say &quot;hi&quot;, a|b</td>");
    });

    it("escapes title and section heading", async () => {
        const blob = await htmlExporter.render(
            exportDocumentWith(
                [{ title: "<i>s</i>", headers: ["h"], rows: [] }],
                "<script>x</script>",
            ),
        );
        const html = await blob.text();
        expect(html).toContain("<title>&lt;script&gt;x&lt;/script&gt;</title>");
        expect(html).toContain("<h1>&lt;script&gt;x&lt;/script&gt;</h1>");
        expect(html).toContain("<h2>&lt;i&gt;s&lt;/i&gt;</h2>");
    });

    it("renders title, one heading and table per section", async () => {
        const { html } = await renderHtml();
        const page = new DOMParser().parseFromString(html, "text/html");
        expect(page.title).toBe("my-app");
        expect([...page.querySelectorAll("h2")].map((h) => h.textContent)).toEqual([
            "Deps",
            "Dev Deps",
        ]);
        const tables = page.querySelectorAll("table");
        expect(tables).toHaveLength(2);
        expect([...tables[0].querySelectorAll("th")].map((th) => th.textContent)).toEqual([
            "Name",
            "Note",
        ]);
        expect(tables[0].querySelectorAll("tbody tr")).toHaveLength(2);
    });
});
