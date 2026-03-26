export type GithubTreeSource = {
  kind: "github-tree";
  raw: string;
  owner: string;
  repo: string;
  urlBase?: string;
  treePath: string;
  ref: string;
  subpath: string;
  defaultName: string;
};

export type GithubRepoSource = {
  kind: "github-repo";
  raw: string;
  owner: string;
  repo: string;
  urlBase?: string;
};

export type ParsedSource = GithubTreeSource | GithubRepoSource;

export type FetchSkillOptions = {
  source: ParsedSource;
  requestedRef: string;
  requestedRefExplicit?: boolean;
  checkoutRef?: string;
  githubBaseUrl?: string;
};

export type FetchedSkill = {
  skillDir: string;
  resolved: string;
  requestedRef: string;
};

export type CheckedOutRepo = {
  checkoutDir: string;
  resolved: string;
  requestedRef: string;
  resolvedTreeSource?: GithubTreeSource;
};

export type DiscoveredSkill = {
  relativeDir: string;
  canonicalName: string;
  absoluteDir: string;
};
