import type { Component } from "vue";
import IconBan from "./IconBan.vue";
import IconBoxes from "./IconBoxes.vue";
import IconCalendar from "./IconCalendar.vue";
import IconCalendarArrowUp from "./IconCalendarArrowUp.vue";
import IconCalendarClock from "./IconCalendarClock.vue";
import IconCircleArrowUp from "./IconCircleArrowUp.vue";
import IconCircleCheck from "./IconCircleCheck.vue";
import IconCircleDot from "./IconCircleDot.vue";
import IconClockAlert from "./IconClockAlert.vue";
import IconCode from "./IconCode.vue";
import IconFileArchive from "./IconFileArchive.vue";
import IconFolderTree from "./IconFolderTree.vue";
import IconGitCommit from "./IconGitCommit.vue";
import IconGitPullRequest from "./IconGitPullRequest.vue";
import IconGitPullRequestClosed from "./IconGitPullRequestClosed.vue";
import IconHeartPulse from "./IconHeartPulse.vue";
import IconPackage from "./IconPackage.vue";
import IconScale from "./IconScale.vue";
import IconShieldAlert from "./IconShieldAlert.vue";
import IconStar from "./IconStar.vue";
import IconTag from "./IconTag.vue";
import IconTrendingUp from "./IconTrendingUp.vue";
import IconUsers from "./IconUsers.vue";

/**
 * Icon per column key, shown in table headers, column pickers and the summary
 * card. Lives beside the components, not in utils/tableColumns, so Node-side
 * code (Playwright specs) can import column defs without loading .vue files.
 */
export const COLUMN_ICONS: Record<string, Component> = {
    name: IconPackage,
    version: IconTag,
    versionDate: IconCalendar,
    latestVersion: IconCircleArrowUp,
    latestReleaseDate: IconCalendarArrowUp,
    latestUpdateDate: IconCalendarClock,
    isOutdated: IconClockAlert,
    healthScore: IconHeartPulse,
    weeklyDownloads: IconTrendingUp,
    sourceCode: IconCode,
    sourceCodeTree: IconFolderTree,
    gitStars: IconStar,
    lastCommitDate: IconGitCommit,
    openPRs: IconGitPullRequest,
    closedPRs: IconGitPullRequestClosed,
    openIssues: IconCircleDot,
    closedIssues: IconCircleCheck,
    dependencies: IconBoxes,
    license: IconScale,
    deprecated: IconBan,
    vulnerabilityCount: IconShieldAlert,
    bundleSizeGzip: IconFileArchive,
    maintainers: IconUsers,
};
