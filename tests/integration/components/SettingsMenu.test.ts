import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { IDBFactory } from "fake-indexeddb";
import SettingsMenu from "../../../src/components/SettingsMenu.vue";
import { STORAGE_KEY_GITHUB_TOKEN } from "../../../src/constants";
import { SETTINGS_DEFAULTS, githubToken, settings } from "../../../src/settings";
import { HTTP_STATUS, jsonResponse, statusResponse } from "../../helpers/fetchMock";

const TOKEN = "github_pat_abc123";

function mountMenu() {
    return mount(SettingsMenu, { attachTo: document.body });
}

async function saveToken(wrapper: ReturnType<typeof mountMenu>, token: string) {
    await wrapper.find('input[type="password"]').setValue(token);
    await wrapper.find("form").trigger("submit");
    // WebCrypto and IndexedDB settle outside the microtask queue.
    await vi.waitFor(() => expect(wrapper.find('[role="status"]').exists()).toBe(true));
}

function button(wrapper: ReturnType<typeof mountMenu>, label: string) {
    return wrapper.findAll("button").find((b) => b.text() === label)!;
}

beforeEach(() => {
    vi.stubGlobal("indexedDB", new IDBFactory());
    localStorage.clear();
});

afterEach(() => {
    githubToken.value = undefined;
    Object.assign(settings, SETTINGS_DEFAULTS);
    document.body.innerHTML = "";
});

describe("SettingsMenu token", () => {
    it("shows badge and set indicator only with token", async () => {
        const wrapper = mountMenu();
        const gear = wrapper.find(".settings-menu__gear");
        expect(wrapper.find(".settings-menu__badge").exists()).toBe(false);
        expect(gear.attributes("aria-label")).toBe("Open settings");
        expect(wrapper.text()).toContain("No token set");

        githubToken.value = TOKEN;
        await flushPromises();

        expect(wrapper.find(".settings-menu__badge").exists()).toBe(true);
        expect(gear.attributes("aria-label")).toBe("Open settings (GitHub token set)");
        expect(wrapper.text()).toContain("Token set");
    });

    it("rejects invalid token", async () => {
        const wrapper = mountMenu();

        await saveToken(wrapper, "bad token!");

        expect(githubToken.value).toBeUndefined();
        expect(wrapper.text()).toContain("only letters, digits and underscores");
        expect(localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN)).toBeNull();
    });

    it("saves valid token encrypted, clears input", async () => {
        const wrapper = mountMenu();

        await saveToken(wrapper, TOKEN);

        expect(githubToken.value).toBe(TOKEN);
        expect(wrapper.find<HTMLInputElement>('input[type="password"]').element.value).toBe("");
        expect(localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN)).not.toContain(TOKEN);
        expect(wrapper.text()).toContain("Token saved.");
    });

    it("purges token, focuses token input", async () => {
        const wrapper = mountMenu();
        await saveToken(wrapper, TOKEN);

        await button(wrapper, "Purge").trigger("click");
        await vi.waitFor(() => expect(wrapper.text()).toContain("Token purged."));

        expect(githubToken.value).toBeUndefined();
        expect(localStorage.getItem(STORAGE_KEY_GITHUB_TOKEN)).toBeNull();
        expect(document.activeElement).toBe(wrapper.find('input[type="password"]').element);
    });

    it("shows unavailable without IndexedDB", () => {
        vi.stubGlobal("indexedDB", undefined);

        const wrapper = mountMenu();

        expect(wrapper.text()).toContain("Token storage needs IndexedDB");
        expect(wrapper.find('input[type="password"]').exists()).toBe(false);
    });

    it("shows remaining / limit on verify", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => jsonResponse({ rate: { limit: 5000, remaining: 4999 } })),
        );
        const wrapper = mountMenu();
        githubToken.value = TOKEN;
        await flushPromises();

        await button(wrapper, "Verify").trigger("click");
        await flushPromises();

        expect(wrapper.text()).toContain("4999 / 5000");
    });

    it("shows invalid on verify 401", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => statusResponse(HTTP_STATUS.unauthorized)),
        );
        const wrapper = mountMenu();
        githubToken.value = TOKEN;
        await flushPromises();

        await button(wrapper, "Verify").trigger("click");
        await flushPromises();

        expect(wrapper.text()).toContain("GitHub rejected this token");
    });
});

describe("SettingsMenu network", () => {
    it("commits valid proxy, rejects non-http proxy", async () => {
        const wrapper = mountMenu();
        const proxy = wrapper.find('input[type="url"]');

        await proxy.setValue("https://p.test/?u={url}");
        expect(settings.proxyUrl).toBe("https://p.test/?u={url}");

        await proxy.setValue("javascript:alert(1)");
        expect(settings.proxyUrl).toBe("https://p.test/?u={url}");
        expect(proxy.attributes("aria-invalid")).toBe("true");
        expect(wrapper.text()).toContain("Enter an http(s) URL");
    });

    it("commits valid int, rejects zero and fraction", async () => {
        const wrapper = mountMenu();
        const [timeout, concurrency] = wrapper.findAll('input[type="number"]');

        await timeout.setValue("1000");
        expect(settings.fetchTimeoutMs).toBe(1000);

        await concurrency.setValue("0");
        await timeout.setValue("1.5");
        expect(settings.fetchConcurrency).toBe(SETTINGS_DEFAULTS.fetchConcurrency);
        expect(settings.fetchTimeoutMs).toBe(1000);
        expect(concurrency.attributes("aria-invalid")).toBe("true");
        expect(wrapper.text()).toContain("Enter a whole number");
    });
});
