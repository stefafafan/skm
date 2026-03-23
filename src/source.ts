import { mkdtemp, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import { validateCanonicalName } from "./canonical-name";
import { SkmError } from "./errors";
import { assertRegularFile, copyDirectory, removeIfExists } from "./fs";
import { cloneAndCheckout, readHeadCommit, runGit } from "./git";

export interface GithubTreeSource {
  kind: "github-tree";
  raw: string;
  owner: string;
  repo: string;
  urlBase?: string;
  treePath: string;
  ref: string;
  subpath: string;
  defaultName: string;
}

export interface GithubRepoSource {
  kind: "github-repo";
  raw: string;
  owner: string;
  repo: string;
  urlBase?: string;
}

export type ParsedSource = GithubTreeSource | GithubRepoSource;

export interface FetchSkillOptions {
  source: ParsedSource;
  requestedRef: string;
  requestedRefExplicit?: boolean;
  checkoutRef?: string;
  githubBaseUrl?: string;
}

export interface FetchedSkill {
  skillDir: string;
  resolved: string;
  requestedRef: string;
}

export interface CheckedOutRepo {
  checkoutDir: string;
  resolved: string;
}

export interface DiscoveredSkill {
  relativeDir: string;
  canonicalName: string;
  absoluteDir: string;
}

export function parseSource(input: string): ParsedSource {
  const parsedUrlSource = parseHttpsGitHubSource(input);
  if (parsedUrlSource) {
    return parsedUrlSource;
  }

  const githubRepoShorthandMatch = /^([^/\s]+)\/([^/\s]+)$/.exec(input);
  if (githubRepoShorthandMatch) {
    const owner = githubRepoShorthandMatch[1];
    const repo = githubRepoShorthandMatch[2];
    if (!owner || !repo) {
      throw new SkmError(`Invalid GitHub repository shorthand: ${input}`, 2);
    }
    return {
      kind: "github-repo",
      raw: input,
      owner,
      repo,
    };
  }

  throw new SkmError(`Unsupported source: ${input}`, 2);
}

export async function fetchSkillToTempDir(
  options: FetchSkillOptions,
  tempRoot?: string,
): Promise<FetchedSkill> {
  if (options.source.kind !== "github-tree") {
    throw new SkmError(`Source ${options.source.raw} does not point to a single skill`, 2);
  }

  const workingRoot = tempRoot ?? (await mkdtemp(path.join(os.tmpdir(), "skm-fetch-")));
  const checkedOut = await checkoutSourceRepo(options, workingRoot);
  const resolvedTreeSource = await resolveTreeSourceLocation(
    checkedOut.checkoutDir,
    options.source,
    options.requestedRef,
    options.requestedRefExplicit ?? false,
  );
  const outputDir = path.join(workingRoot, validateCanonicalName(resolvedTreeSource.defaultName));
  const upstreamSkillDir = path.join(checkedOut.checkoutDir, resolvedTreeSource.subpath);
  const skillMdPath = path.join(upstreamSkillDir, "SKILL.md");
  await assertRegularFile(skillMdPath, `Skill source ${options.source.raw} SKILL.md`);

  await copyDirectory(upstreamSkillDir, outputDir);
  await removeIfExists(checkedOut.checkoutDir);

  return {
    skillDir: outputDir,
    resolved: checkedOut.resolved,
    requestedRef: resolvedTreeSource.ref,
  };
}

export function isFixedRef(ref: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(ref);
}

export function defaultRequestedRef(source: ParsedSource): string {
  return source.kind === "github-tree" ? source.ref : "main";
}

export function canonicalTreeUrl(
  source: GithubRepoSource | GithubTreeSource,
  ref: string,
  subpath: string,
): string {
  return `${resolveCanonicalGithubBaseUrl(source)}/${source.owner}/${source.repo}/tree/${ref}/${subpath}`;
}

export async function checkoutSourceRepo(
  options: FetchSkillOptions,
  tempRoot?: string,
): Promise<CheckedOutRepo> {
  const workingRoot = tempRoot ?? (await mkdtemp(path.join(os.tmpdir(), "skm-fetch-")));
  const checkoutDir = path.join(workingRoot, `checkout-${randomUUID()}`);
  const repoUrl = resolveRepoUrl(options.source, options.githubBaseUrl);

  await removeIfExists(checkoutDir);
  if (options.source.kind === "github-tree") {
    await runGit(["clone", "--quiet", "--no-checkout", repoUrl, checkoutDir]);
    const resolvedTreeSource = await resolveTreeSourceLocation(
      checkoutDir,
      options.source,
      options.requestedRef,
      options.requestedRefExplicit ?? options.requestedRef !== options.source.ref,
    );
    const checkoutRef = options.checkoutRef ?? resolvedTreeSource.ref;
    const resolvedCommit = await resolveGitCommit(checkoutDir, checkoutRef);
    if (!resolvedCommit) {
      throw new SkmError(`Unable to resolve git ref: ${checkoutRef}`, 3);
    }
    await runGit(["checkout", "--quiet", "--detach", resolvedCommit], checkoutDir);
  } else {
    await cloneAndCheckout(repoUrl, options.requestedRef, checkoutDir);
  }

  return {
    checkoutDir,
    resolved: await readHeadCommit(checkoutDir),
  };
}

export async function discoverSkillsInRepo(repoDir: string): Promise<DiscoveredSkill[]> {
  const discovered = new Map<string, DiscoveredSkill>();
  await walk(repoDir);
  return [...discovered.values()].sort((left, right) =>
    left.relativeDir.localeCompare(right.relativeDir),
  );

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    const skillMdEntry = entries.find((entry) => entry.name === "SKILL.md");
    if (skillMdEntry?.isSymbolicLink()) {
      throw new SkmError(`Discovered skill at ${currentDir} SKILL.md cannot be a symlink`, 4);
    }
    const hasSkill = skillMdEntry?.isFile() ?? false;
    if (hasSkill) {
      const relativeDir = path.relative(repoDir, currentDir) || ".";
      const canonicalName = validateCanonicalName(path.basename(currentDir));
      discovered.set(relativeDir, {
        relativeDir,
        canonicalName,
        absoluteDir: currentDir,
      });
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      await walk(path.join(currentDir, entry.name));
    }
  }
}

function resolveRepoUrl(
  source: ParsedSource,
  githubBaseUrl = process.env.SKM_GITHUB_BASE_URL ?? "https://github.com",
): string {
  const trimmedBase = githubBaseUrl.replace(/\/$/, "");
  if (trimmedBase.includes("://")) {
    return `${trimmedBase}/${source.owner}/${source.repo}.git`;
  }
  return path.join(trimmedBase, source.owner, `${source.repo}.git`);
}

function parseHttpsGitHubSource(input: string): ParsedSource | undefined {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return undefined;
  }

  if (url.protocol !== "https:" || url.search || url.hash) {
    return undefined;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 2) {
    const [owner, repo] = segments;
    if (!owner || !repo) {
      throw new SkmError(`Invalid GitHub repository URL: ${input}`, 2);
    }
    return {
      kind: "github-repo",
      raw: input,
      owner,
      repo,
      urlBase: url.origin,
    };
  }

  if (segments.length >= 5 && segments[2] === "tree") {
    const [owner, repo, , ref, ...subpathSegments] = segments;
    const subpath = subpathSegments.join("/");
    const treePath = segments.slice(3).join("/");
    if (!owner || !repo || !ref || !subpath) {
      throw new SkmError(`Invalid GitHub source: ${input}`, 2);
    }
    return {
      kind: "github-tree",
      raw: input,
      owner,
      repo,
      urlBase: url.origin,
      treePath,
      ref,
      subpath,
      defaultName: path.basename(subpath),
    };
  }

  return undefined;
}

function resolveCanonicalGithubBaseUrl(source: GithubRepoSource | GithubTreeSource): string {
  return (source.urlBase ?? process.env.SKM_GITHUB_URL_BASE ?? "https://github.com").replace(
    /\/$/,
    "",
  );
}

async function resolveTreeSourceLocation(
  repoDir: string,
  source: GithubTreeSource,
  requestedRef: string,
  requestedRefExplicit: boolean,
): Promise<GithubTreeSource> {
  const treePath = source.treePath;

  if (requestedRefExplicit) {
    const explicitSubpath = inferSubpathForExplicitRef(source, requestedRef);
    const resolvedCommit = await resolveGitCommit(repoDir, requestedRef);
    if (!resolvedCommit) {
      throw new SkmError(`Unable to resolve git ref: ${requestedRef}`, 3);
    }
    return {
      ...source,
      ref: requestedRef,
      subpath: explicitSubpath,
      defaultName: path.basename(explicitSubpath),
    };
  }

  const treeSegments = treePath.split("/");
  for (let index = treeSegments.length - 1; index >= 1; index -= 1) {
    const candidateRef = treeSegments.slice(0, index).join("/");
    const candidateSubpath = treeSegments.slice(index).join("/");
    if (!candidateSubpath) {
      continue;
    }

    if (await resolveGitCommit(repoDir, candidateRef)) {
      return {
        ...source,
        ref: candidateRef,
        subpath: candidateSubpath,
        defaultName: path.basename(candidateSubpath),
      };
    }
  }

  throw new SkmError(`Unable to resolve ref and subpath from source: ${source.raw}`, 2);
}

function inferSubpathForExplicitRef(source: GithubTreeSource, requestedRef: string): string {
  if (source.treePath.startsWith(`${requestedRef}/`)) {
    return source.treePath.slice(requestedRef.length + 1);
  }

  if (source.subpath) {
    return source.subpath;
  }

  throw new SkmError(`Unable to resolve subpath for source: ${source.raw}`, 2);
}

async function resolveGitCommit(repoDir: string, ref: string): Promise<string | undefined> {
  if (ref.startsWith("-")) {
    throw new SkmError(`Invalid git ref: ${ref}`, 3);
  }

  const candidates = [ref, `origin/${ref}`, `refs/remotes/origin/${ref}`, `refs/tags/${ref}`];
  for (const candidate of candidates) {
    try {
      return (
        await runGit(["rev-parse", "--verify", "--end-of-options", `${candidate}^{commit}`], repoDir)
      ).trim();
    } catch {
      continue;
    }
  }
  return undefined;
}
