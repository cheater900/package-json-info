import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import ReportDialog from "../../../src/app/components/ReportDialog.vue";
import { reportFixture } from "../../fixtures/report";
import { stubDownload } from "../../helpers/download";
import { buttonWithText } from "../../helpers/wrapper";

function mountDialog() {
    return mount(ReportDialog, { props: { report: reportFixture, fileBaseName: "my-app-report" } });
}

describe("ReportDialog", () => {
    it("renders blocks as heading, paragraph, list, table text", () => {
        const wrapper = mountDialog();
        expect(wrapper.find("h2").text()).toBe("Dependency report: my-app");
        expect(wrapper.find("h4").text()).toBe("Over 1 year");
        expect(wrapper.find("p").text()).toBe("Open / (open + closed) <b>");
        expect(wrapper.findAll("li").map((item) => item.text())).toEqual([
            "left-pad 1.2.0 (License: MIT)",
            "a|b",
        ]);
        expect(wrapper.findAll("th").map((cell) => cell.text())).toEqual(["Preset", "Deps"]);
        expect(wrapper.findAll("td").map((cell) => cell.text())).toEqual(["Unknown", "1 (50%)"]);
    });

    it("saves Markdown file", async () => {
        const { createObjectURL, click } = stubDownload();
        await buttonWithText(mountDialog(), "Export Markdown").trigger("click");
        const blob = createObjectURL.mock.calls[0][0] as Blob;
        expect(blob.type).toBe("text/markdown;charset=utf-8");
        expect(await blob.text()).toContain("### Over 1 year");
        expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe("my-app-report.md");
    });

    it("saves PDF file", async () => {
        const { createObjectURL, click } = stubDownload();
        await buttonWithText(mountDialog(), "Export PDF").trigger("click");
        expect((createObjectURL.mock.calls[0][0] as Blob).type).toBe("application/pdf");
        expect((click.mock.contexts[0] as HTMLAnchorElement).download).toBe("my-app-report.pdf");
    });

    it("shows error when PDF save fails", async () => {
        vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
            throw new Error("boom");
        });
        const wrapper = mountDialog();
        await buttonWithText(wrapper, "Export PDF").trigger("click");
        expect(wrapper.find("[role='alert']").text()).toBe(
            "Export failed. Try again or pick the other format.",
        );
    });

    it("clears PDF error after Markdown save", async () => {
        const { createObjectURL } = stubDownload();
        createObjectURL.mockImplementationOnce(() => {
            throw new Error("boom");
        });
        const wrapper = mountDialog();
        await buttonWithText(wrapper, "Export PDF").trigger("click");
        expect(wrapper.find("[role='alert']").exists()).toBe(true);
        await buttonWithText(wrapper, "Export Markdown").trigger("click");
        expect(wrapper.find("[role='alert']").exists()).toBe(false);
    });
});
