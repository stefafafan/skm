import type { GithubRepoSource, GithubTreeSource } from "./types.js";

export function canonicalTreeUrl(
  source: GithubRepoSource | GithubTreeSource,
  ref: string,
  subpath: string,
): string {
  return `${resolveCanonicalGithubBaseUrl(source)}/${source.owner}/${source.repo}/tree/${ref}/${subpath}`;
}

function resolveCanonicalGithubBaseUrl(source: GithubRepoSource | GithubTreeSource): string {
  const configuredCloneBaseUrl = process.env.SKM_GITHUB_BASE_URL;
  const fallbackBaseUrl =
    configuredCloneBaseUrl && configuredCloneBaseUrl.includes("://")
      ? configuredCloneBaseUrl
      : "https://github.com";

  return (source.urlBase ?? process.env.SKM_GITHUB_URL_BASE ?? fallbackBaseUrl).replace(/\/$/, "");
}
