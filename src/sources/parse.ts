import path from "node:path";

import { fromSkmThrowable, SkmError } from "../shared/errors.js";
import type { GithubRepoSource, ParsedSource } from "./types.js";

export const parseSourceResult = fromSkmThrowable((input: string) => parseSource(input));

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

export function isGithubRepoSource(source: ParsedSource): source is GithubRepoSource {
  return source.kind === "github-repo";
}
