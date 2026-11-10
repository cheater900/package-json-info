import type { Component } from "vue";
import type { NetworkLogState } from "../utils/networkLog";
import IconCheck from "./IconCheck.vue";
import IconCross from "./IconCross.vue";
import IconQuestion from "./IconQuestion.vue";

export const STATE_ICONS: Record<NetworkLogState, Component> = {
    pending: IconQuestion,
    success: IconCheck,
    failure: IconCross,
};
