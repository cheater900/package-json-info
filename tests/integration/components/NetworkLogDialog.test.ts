import { describe, it, expect, afterEach, onTestFinished } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { clearPackageInfoCache, fetchPackageInfo } from "../../../src/api/npmPackage";
import NetworkLogDialog from "../../../src/components/NetworkLogDialog.vue";
import { NPM_REGISTRY_URL, NUMBER_LOCALE } from "../../../src/constants";
import { networkLogEntries, startNetworkLog } from "../../../src/utils/networkLog";
import type { NetworkLogEntry } from "../../../src/utils/networkLog";
import { minimalRegistryDoc } from "../../fixtures/dependencies";
import { LOG_ENTRY_STARTED_AT, networkLogEntry } from "../../fixtures/networkLog";
import { stubFetchByUrl } from "../../helpers/fetchMock";

const successEntry = networkLogEntry({ id: 1 });
const failureEntry = networkLogEntry({
    id: 2,
    method: "POST",
    url: "https://api.osv.dev/v1/query",
    state: "failure",
    status: null,
    sizeBytes: null,
    error: "Failed to fetch",
    subject: null,
});
const pendingEntry = networkLogEntry({ id: 3, state: "pending", status: null, sizeBytes: null });
const notFoundEntry = networkLogEntry({ id: 4, state: "failure", status: 404, sizeBytes: 0 });

function mountDialog(entries: NetworkLogEntry[]) {
    networkLogEntries.push(...entries);
    return mount(NetworkLogDialog);
}

function rowCells(wrapper: ReturnType<typeof mountDialog>, index: number) {
    return wrapper.findAll("tbody tr")[index].findAll("td");
}

afterEach(() => {
    networkLogEntries.splice(0);
    clearPackageInfoCache();
});

describe("NetworkLogDialog", () => {
    it("shows column headers", () => {
        const headers = mountDialog([])
            .findAll("th")
            .map((th) => th.text());

        expect(headers).toEqual([
            "State",
            "Time",
            "Request",
            "Packages",
            "Columns",
            "Status",
            "Size",
            "Actions",
        ]);
    });

    it("lists newest entry first", () => {
        const wrapper = mountDialog([successEntry, failureEntry, pendingEntry]);

        const labels = wrapper.findAll("[role=img]").map((icon) => icon.attributes("aria-label"));
        expect(labels).toEqual(["Pending", "Failed", "Succeeded"]);
    });

    it("colors state icon per state", () => {
        const wrapper = mountDialog([successEntry, failureEntry, pendingEntry]);

        const classes = wrapper.findAll("[role=img]").map((icon) => icon.classes());
        expect(classes[0]).toContain("network-log__state--pending");
        expect(classes[1]).toContain("network-log__state--failure");
        expect(classes[2]).toContain("network-log__state--success");
    });

    it("shows time, method badge, URL, packages, column labels, status and size", () => {
        const wrapper = mountDialog([successEntry]);

        const cells = rowCells(wrapper, 0);
        expect(cells[1].text()).toBe(
            new Date(LOG_ENTRY_STARTED_AT).toLocaleTimeString(NUMBER_LOCALE),
        );
        expect(cells[2].find(".network-log__badge").text()).toBe("GET");
        expect(cells[2].text()).toBe(`GET ${NPM_REGISTRY_URL}/zod`);
        expect(cells.slice(3, 7).map((cell) => cell.text())).toEqual([
            "zod",
            "Latest version, License",
            "200",
            "1.5 KB",
        ]);
        expect(cells[5].find(".network-log__badge").exists()).toBe(true);
    });

    it("shows missing value for no subject, status or size, error as status title", () => {
        const wrapper = mountDialog([failureEntry]);

        const cells = rowCells(wrapper, 0);
        expect(cells[2].find(".network-log__badge").text()).toBe("POST");
        expect(cells.slice(3, 7).map((cell) => cell.text())).toEqual(["-", "-", "-", "-"]);
        expect(cells[5].attributes("title")).toBe("Failed to fetch");
    });

    it("shows 404 status badge on failed row", () => {
        const wrapper = mountDialog([notFoundEntry]);

        expect(rowCells(wrapper, 0)[0].find("[role=img]").attributes("aria-label")).toBe("Failed");
        expect(rowCells(wrapper, 0)[5].text()).toBe("404");
    });

    it("shows retry button on failed rows only", () => {
        const wrapper = mountDialog([successEntry, failureEntry, pendingEntry, notFoundEntry]);

        const rowsWithRetry = wrapper
            .findAll("tbody tr")
            .map((row) => row.find(".network-log__retry").exists());
        expect(rowsWithRetry).toEqual([true, false, true, false]);
    });

    it("retry button emits retry with entry", async () => {
        const wrapper = mountDialog([successEntry, failureEntry]);

        await wrapper.find('[aria-label="Retry https://api.osv.dev/v1/query"]').trigger("click");

        expect(wrapper.emitted("retry")).toEqual([[failureEntry]]);
    });

    it("shows summary counts", () => {
        const wrapper = mountDialog([successEntry, failureEntry, pendingEntry, notFoundEntry]);

        expect(wrapper.find(".network-log__summary").text()).toBe(
            "4 requests: 2 failed, 1 pending, 1 successful",
        );
    });

    it("shows empty state row without entries", () => {
        const wrapper = mountDialog([]);

        expect(wrapper.findAll("tbody tr")).toHaveLength(1);
        expect(wrapper.find("tbody").text()).toBe("No requests yet.");
        expect(wrapper.find(".network-log__summary").text()).toBe(
            "0 requests: 0 failed, 0 pending, 0 successful",
        );
    });

    it("adds package joining shared lookup while open", async () => {
        onTestFinished(startNetworkLog());
        stubFetchByUrl({
            "registry.npmjs.org": {
                ...minimalRegistryDoc,
                repository: "git+https://github.com/shared-org/shared-repo.git",
            },
            "api.github.com/repos": { stargazers_count: 1 },
        });
        const options = { visibleColumns: new Set(["gitStars"]) };
        await fetchPackageInfo("pkg-a", "1.0.0", options);
        const wrapper = mount(NetworkLogDialog);

        await fetchPackageInfo("pkg-b", "1.0.0", options);
        await flushPromises();

        const starsRow = wrapper
            .findAll("tbody tr")
            .find((row) => row.text().includes("api.github.com/repos"));
        expect(starsRow?.findAll("td")[3].text()).toBe("pkg-a, pkg-b");
    });
});

describe("NetworkLogDialog long text", () => {
    it("wraps request, packages and columns in TextWrapped", () => {
        const wrapper = mountDialog([successEntry]);

        const cells = rowCells(wrapper, 0);
        const wrapped = [2, 3, 4].map((i) => cells[i].find(".text-wrapped").exists());
        expect(wrapped).toEqual([true, true, true]);
    });
});
