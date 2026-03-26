import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { removeIfExists } from "../platform/fs.js";
import { readHeadCommit, runGit } from "../platform/git.js";
import { SkmError } from "../shared/errors.js";
import type { CheckedOutRepo, FetchSkillOptions, GithubTreeSource, ParsedSource } from "./types.js";

export function isFixedRef(ref: string): boolean {
  return /^[0-9a-f]{7,40}$/i.test(ref);
}

export function defaultRequestedRef(source: ParsedSource): string {
  return source.kind === "github-tree" ? source.ref : "main";
}

export async function checkoutSourceRepo(
  options: FetchSkillOptions,
  tempRoot?: string,
): Promise<CheckedOutRepo> {
  const workingRoot = tempRoot ?? (await mkdtemp(path.join(os.tmpdir(), "skm-fetch-")));
  const checkoutDir = path.join(workingRoot, `checkout-${randomUUID()}`);
  const repoUrl = resolveRepoUrl(options.source, options.githubBaseUrl);

  await removeIfExists(checkoutDir);
  await runGit(["clone", "--quiet", "--no-checkout", repoUrl, checkoutDir]);

  if (options.source.kind === "github-tree") {
    const requestedRefExplicit = resolveRequestedRefExplicit(options);
    const resolvedTreeSource = await resolveTreeSourceLocation(
      checkoutDir,
      options.source,
      options.requestedRef,
      requestedRefExplicit,
    );
    const checkoutRef = options.checkoutRef ?? resolvedTreeSource.ref;
    const resolvedCommit = await resolveGitCommit(checkoutDir, checkoutRef);
    if (!resolvedCommit) {
      throw new SkmError(`Unable to resolve git ref: ${checkoutRef}`, 3);
    }
    await runGit(["checkout", "--quiet", "--detach", resolvedCommit], checkoutDir);
    return {
      checkoutDir,
      resolved: await readHeadCommit(checkoutDir),
      requestedRef: resolvedTreeSource.ref,
      resolvedTreeSource,
    };
  }

  const requestedRef =
    options.requestedRefExplicit || isFixedRef(options.requestedRef)
      ? options.requestedRef
      : ((await resolveRemoteDefaultBranch(repoUrl, checkoutDir)) ?? options.requestedRef);
  const checkoutRef = options.checkoutRef ?? requestedRef;
  const resolvedCommit = await resolveGitCommit(checkoutDir, checkoutRef);
  if (!resolvedCommit) {
    throw new SkmError(`Unable to resolve git ref: ${checkoutRef}`, 3);
  }
  await runGit(["checkout", "--quiet", "--detach", resolvedCommit], checkoutDir);
  return {
    checkoutDir,
    resolved: await readHeadCommit(checkoutDir),
    requestedRef,
  };
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
        await runGit(
          ["rev-parse", "--verify", "--end-of-options", `${candidate}^{commit}`],
          repoDir,
        )
      ).trim();
    } catch {
      continue;
    }
  }
  return undefined;
}

async function resolveRemoteDefaultBranch(
  repoUrl: string,
  repoDir: string,
): Promise<string | undefined> {
  try {
    return (await runGit(["symbolic-ref", "--quiet", "--short", "HEAD"], repoDir)).trim();
  } catch {}

  try {
    const remoteHead = await runGit(["ls-remote", "--symref", repoUrl, "HEAD"]);
    const headLine = remoteHead
      .split("\n")
      .find((line) => line.startsWith("ref: refs/heads/") && line.endsWith("\tHEAD"));
    if (headLine) {
      return headLine.slice("ref: refs/heads/".length, headLine.length - "\tHEAD".length);
    }
  } catch {}

  try {
    const symbolicRef = (
      await runGit(["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"], repoDir)
    ).trim();
    return symbolicRef.startsWith("origin/") ? symbolicRef.slice("origin/".length) : undefined;
  } catch {
    return undefined;
  }
}

function resolveRequestedRefExplicit(options: FetchSkillOptions): boolean {
  if (options.source.kind !== "github-tree") {
    return options.requestedRefExplicit ?? false;
  }

  return options.requestedRefExplicit ?? options.requestedRef !== options.source.ref;
}
