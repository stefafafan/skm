import { mkdtemp, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { SkmError } from "./errors";
import { assertRegularFile, copyDirectory, removeIfExists } from "./fs";
import { cloneAndCheckout, readHeadCommit } from "./git";

export interface GithubTreeSource {
  kind: "github-tree";
  raw: string;
  owner: string;
  repo: string;
  urlBase?: string;
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
  githubBaseUrl?: string;
}

export interface FetchedSkill {
  skillDir: string;
  resolved: string;
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
  const outputDir = path.join(workingRoot, options.source.defaultName);
  const checkedOut = await checkoutSourceRepo(options, workingRoot);
  const upstreamSkillDir = path.join(checkedOut.checkoutDir, options.source.subpath);
  const skillMdPath = path.join(upstreamSkillDir, "SKILL.md");
  await assertRegularFile(skillMdPath, `Skill source ${options.source.raw} SKILL.md`);

  await copyDirectory(upstreamSkillDir, outputDir);
  await removeIfExists(checkedOut.checkoutDir);

  return {
    skillDir: outputDir,
    resolved: checkedOut.resolved,
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
  await cloneAndCheckout(repoUrl, options.requestedRef, checkoutDir);

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
      discovered.set(relativeDir, {
        relativeDir,
        canonicalName: path.basename(currentDir),
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
    if (!owner || !repo || !ref || !subpath) {
      throw new SkmError(`Invalid GitHub source: ${input}`, 2);
    }
    return {
      kind: "github-tree",
      raw: input,
      owner,
      repo,
      urlBase: url.origin,
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
