import type { VueWrapper } from "@vue/test-utils";

/** Button of `wrapper` whose text is exactly `text`. */
export function buttonWithText(wrapper: VueWrapper, text: string) {
    return wrapper.findAll("button").find((button) => button.text() === text)!;
}
