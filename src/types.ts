export type PackageInput = {
  name: string;
  version: string;
}


export type PackageInfo = {
  name: string;
  version: string;
  versionDate: string | null;
  latestVersion: string | null;
  latestReleaseDate: string | null;
  latestUpdateDate: string | null;
  weeklyDownloads: number | null;
  sourceCode: string | null;
  gitStars: number | null;
  openPRs: number | null;
  closedPRs: number | null;
  openIssues: number | null;
  closedIssues: number | null;
  dependencies: string[] | null;
}

export type PackageError = {
  name: string;
  version: string;
  error: string;
}
