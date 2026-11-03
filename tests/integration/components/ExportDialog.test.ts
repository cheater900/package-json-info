import { describe, it, expect, vi, afterEach } from "vitest";
import { nextTick } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import ExportDialog from "../../../src/components/ExportDialog.vue";
import type { ExportDialogTable } from "../../../src/components/ExportDialog";
import { EXPORTERS } from "../../../src/utils/export";
import { DEFAULT_COLUMN_ORDER } from "../../../src/utils/tableColumns";
import type { DependencyListId, DependencyRow } from "../../../src/types";
import { fullDependency, sparseDependency } from "../../fixtures/dependencies";

type LoadRows = (
    list: DependencyListId,
    columns: ReadonlySet<string>,
) => Promise<DependencyRow[] | null>;

type LoadCall = {
    list: DependencyListId;
    columns: ReadonlySet<string>;
    resolve: (rows: DependencyRow[] | null) => void;
};

const TABLES: ExportDialogTable[] = [
    { id: "deps", title: "Deps" },
    { id: "devDeps", title: "Dev Deps" },
];
const INITIAL_COLUMNS = ["version", "license", "sourceCodeTree"];
const ROWS_BY_LIST: Record<DependencyListId, DependencyRow[]> = {
    deps: [fullDependency],
    devDeps: [sparseDependency],
};

// Registry entries are copies of the format files; spy on the entry the dialog renders.
const csvEntry = EXPORTERS.find((e) => e.id === "csv")!;
const markdownEntry = EXPORTERS.find((e) => e.id === "markdown")!;

/** loadRows answering each list with its fixture rows at once. */
function instantLoadRows() {
    return vi.fn(async (list: DependencyListId) => ROWS_BY_LIST[list]);
}

/** loadRows whose calls stay pending until resolved by hand. */
function deferredLoadRows() {
    const calls: LoadCall[] = [];
    const loadRows = vi.fn(
        (list: DependencyListId, columns: ReadonlySet<string>) =>
            new Promise<DependencyRow[] | null>((resolve) =>
                calls.push({ list, columns, resolve }),
            ),
    );
    return { loadRows, calls };
}

function mountDialog(
    loadRows: LoadRows = instantLoadRows(),
    initialTableIds: DependencyListId[] = ["deps", "devDeps"],
) {
    return mount(ExportDialog, {
        props: {
            tables: TABLES,
            initialTableIds,
            columnOrder: DEFAULT_COLUMN_ORDER,
            initialColumns: INITIAL_COLUMNS,
            fetchedColumns: new Set(INITIAL_COLUMNS),
            title: "@demo/app",
            loadRows,
        },
    });
}

/** Stubs object URLs and link clicks, so a download saves nothing. */
function stubDownload() {
    return {
        createObjectURL: vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:export"),
        revokeObjectURL: vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {}),
        click: vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {}),
    };
}

function checkbox(wrapper: ReturnType<typeof mountDialog>, value: string) {
    return wrapper.find(`input[type="checkbox"][value="${value}"]`);
}

function downloadButton(wrapper: ReturnType<typeof mountDialog>) {
    return wrapper.find('button[type="submit"]');
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("ExportDialog", () => {
    it("checks both tables and initial columns, lists formats CSV first", async () => {
        const loadRows = instantLoadRows();
        const wrapper = mountDialog(loadRows);
        await flushPromises();

        expect((checkbox(wrapper, "deps").element as HTMLInputElement).checked).toBe(true);
        expect((checkbox(wrapper, "devDeps").element as HTMLInputElement).checked).toBe(true);
        const checkedColumns = wrapper
            .findAll('.export-dialog__columns input[type="checkbox"]')
            .filter((input) => (input.element as HTMLInputElement).checked)
            .map((input) => input.attributes("value"));
        expect(checkedColumns).toEqual(["version", "license"]);
        expect(checkbox(wrapper, "sourceCodeTree").exists()).toBe(false);
        expect(wrapper.findAll("option").map((o) => o.text())).toEqual(
            EXPORTERS.map((e) => e.label),
        );
        expect((wrapper.find("select").element as HTMLSelectElement).value).toBe("csv");
        expect(loadRows).toHaveBeenCalledWith("deps", new Set(["version", "license"]));
        expect(loadRows).toHaveBeenCalledWith("devDeps", new Set(["version", "license"]));
        expect(downloadButton(wrapper).attributes("disabled")).toBeUndefined();
    });

    it("checks only initial table, loads its rows, keeps other table checkable", async () => {
        const loadRows = instantLoadRows();
        const wrapper = mountDialog(loadRows, ["devDeps"]);
        await flushPromises();

        expect((checkbox(wrapper, "deps").element as HTMLInputElement).checked).toBe(false);
        expect((checkbox(wrapper, "devDeps").element as HTMLInputElement).checked).toBe(true);
        expect(loadRows).not.toHaveBeenCalledWith("deps", expect.anything());
        await checkbox(wrapper, "deps").setValue(true);
        await flushPromises();
        expect(loadRows).toHaveBeenCalledWith("deps", new Set(["version", "license"]));
        expect(downloadButton(wrapper).attributes("disabled")).toBeUndefined();
    });

    it("disables Download, shows hint with no table checked", async () => {
        const wrapper = mountDialog();
        await flushPromises();

        await checkbox(wrapper, "deps").setValue(false);
        await checkbox(wrapper, "devDeps").setValue(false);
        await flushPromises();

        expect(downloadButton(wrapper).attributes("disabled")).toBeDefined();
        expect(wrapper.find(".export-dialog__hint").text()).toBe("Pick at least one table.");
    });

    it("shows spinner on unfetched column, disables Download until loadRows resolves", async () => {
        const { loadRows, calls } = deferredLoadRows();
        const wrapper = mountDialog(loadRows);
        calls.forEach((call) => call.resolve(ROWS_BY_LIST[call.list]));
        await flushPromises();

        await checkbox(wrapper, "vulnerabilityCount").setValue(true);

        const spinners = wrapper.findAll('[role="status"]');
        expect(spinners).toHaveLength(1);
        expect(spinners[0].element.closest("label")!.textContent).toContain("Vulnerabilities");
        expect(downloadButton(wrapper).attributes("disabled")).toBeDefined();
        expect(calls.slice(2).map((call) => call.columns)).toEqual([
            new Set(["version", "license", "vulnerabilityCount"]),
            new Set(["version", "license", "vulnerabilityCount"]),
        ]);
        calls.slice(2).forEach((call) => call.resolve(ROWS_BY_LIST[call.list]));
        await flushPromises();

        expect(wrapper.find('[role="status"]').exists()).toBe(false);
        expect(downloadButton(wrapper).attributes("disabled")).toBeUndefined();
    });

    it("ignores stale loadRows result", async () => {
        const { loadRows, calls } = deferredLoadRows();
        const render = vi.spyOn(csvEntry, "render");
        stubDownload();
        const wrapper = mountDialog(loadRows);
        await checkbox(wrapper, "devDeps").setValue(false);

        calls[2].resolve([sparseDependency]);
        await flushPromises();
        calls[0].resolve([fullDependency]);
        calls[1].resolve([fullDependency]);
        await flushPromises();
        await wrapper.find("form").trigger("submit");
        await flushPromises();

        const { sections } = render.mock.calls[0][0];
        expect(sections.map((s) => s.title)).toEqual(["Deps"]);
        expect(sections[0].rows.map((row) => row[0])).toEqual(["no-data-pkg"]);
    });

    it("saves file with extension of picked format", async () => {
        vi.spyOn(markdownEntry, "render").mockReturnValue(new Blob(["x"]));
        const { click } = stubDownload();
        const wrapper = mountDialog();
        await flushPromises();

        await wrapper.find("select").setValue("markdown");
        await wrapper.find("form").trigger("submit");
        await flushPromises();

        const link = click.mock.contexts[0] as HTMLAnchorElement;
        expect(link.download).toBe("demo-app-dependencies.md");
    });

    it("renders every row of checked tables with checked columns, saves, emits close", async () => {
        const render = vi.spyOn(csvEntry, "render");
        const { createObjectURL, click } = stubDownload();
        const wrapper = mountDialog();
        await checkbox(wrapper, "devDeps").setValue(false);
        await checkbox(wrapper, "license").setValue(false);
        await flushPromises();

        await wrapper.find("form").trigger("submit");
        await flushPromises();

        expect(render).toHaveBeenCalledWith({
            title: "@demo/app",
            sectionHeader: "Section",
            sections: [
                { title: "Deps", headers: ["Name", "Version"], rows: [["left-pad", "1.2.0"]] },
            ],
        });
        expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
        const link = click.mock.contexts[0] as HTMLAnchorElement;
        expect(link.download).toBe("demo-app-dependencies.csv");
        expect(link.href).toBe("blob:export");
        expect(wrapper.emitted("close")).toHaveLength(1);
    });

    it("shows error, stays open when render throws", async () => {
        vi.spyOn(csvEntry, "render").mockImplementation(() => {
            throw new Error("boom");
        });
        const wrapper = mountDialog();
        await flushPromises();

        await wrapper.find("form").trigger("submit");
        await flushPromises();

        expect(wrapper.find('[role="alert"]').text()).toBe(
            "Export failed. Try again or pick another format.",
        );
        expect(wrapper.emitted("close")).toBeUndefined();
        await vi.waitFor(() =>
            expect(downloadButton(wrapper).attributes("disabled")).toBeUndefined(),
        );
    });

    it("keeps Download disabled when package.json changed mid-load", async () => {
        const { loadRows, calls } = deferredLoadRows();
        const wrapper = mountDialog(loadRows);

        calls[0].resolve(null);
        calls[1].resolve([sparseDependency]);
        await flushPromises();

        expect(downloadButton(wrapper).attributes("disabled")).toBeDefined();
    });

    it("ignores second submit while export runs", async () => {
        let finishRender: (blob: Blob) => void = () => {};
        const render = vi
            .spyOn(csvEntry, "render")
            .mockImplementation(() => new Promise((resolve) => (finishRender = resolve)));
        const { click } = stubDownload();
        const wrapper = mountDialog();
        await flushPromises();
        const form = wrapper.find("form");

        await form.trigger("submit");
        await form.trigger("submit");

        expect(render).toHaveBeenCalledTimes(1);
        expect(downloadButton(wrapper).attributes("disabled")).toBeDefined();
        finishRender(new Blob(["x"]));
        await flushPromises();
        expect(click).toHaveBeenCalledTimes(1);
    });

    it("ignores submit queued behind sync render, unlocks in later task", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout"] });
        const render = vi.spyOn(csvEntry, "render");
        stubDownload();
        const wrapper = mountDialog();
        await flushPromises();
        const form = wrapper.find("form");

        await form.trigger("submit");
        await flushPromises();
        // Second click of a double click, dispatched once the blocking render returns.
        await form.trigger("submit");
        expect(render).toHaveBeenCalledTimes(1);
        vi.runAllTimers();
        await nextTick();
        await form.trigger("submit");

        expect(render).toHaveBeenCalledTimes(2);
    });
});
