import { describe, it, expect } from "vitest";
import { htmlExporter } from "../../../../src/utils/export/exporters/html";
import { exportDocumentFixture } from "../../../fixtures/exportDocument";

async function renderHtml() {
    const blob = await htmlExporter.render(exportDocumentFixture);
    return { type: blob.type, html: await blob.text() };
}

describe("htmlExporter", () => {
    it("writes standalone page: doctype, inline style, no script or external link", async () => {
        const { type, html } = await renderHtml();
        expect(type).toBe("text/html;charset=utf-8");
        expect(html.startsWith("<!doctype html>")).toBe(true);
        expect(html).toContain("<style>");
        expect(html).not.toMatch(/<script|<link|src=|href=/i);
    });

    it("escapes cell text", async () => {
        const { html } = await renderHtml();
        expect(html).toContain("<td>&lt;b&gt;&amp;&lt;/b&gt;</td>");
        expect(html).toContain("<td>say &quot;hi&quot;, a|b</td>");
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
