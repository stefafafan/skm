import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import { canonicalTreeUrl, fetchSkillToTempDir, parseSource } from "../src/source";
import { createSkillRepoFixture, createTempDir } from "./helpers/fixture";

test("parseSource extracts owner, repo, ref, subpath, and default canonical name from a GitHub tree URL", () => {
  const parsed = parseSource("https://example.com/example/skills/tree/main/skills/hello-skill");

  assert.equal(parsed.kind, "github-tree");
  assert.equal(parsed.owner, "example");
  assert.equal(parsed.repo, "skills");
  assert.equal(parsed.ref, "main");
  assert.equal(parsed.subpath, "skills/hello-skill");
  assert.equal(parsed.defaultName, "hello-skill");
});

test("parseSource accepts owner/repo shorthand as a repo-wide source", () => {
  const parsed = parseSource("example/skills");

  assert.equal(parsed.kind, "github-repo");
  assert.equal(parsed.owner, "example");
  assert.equal(parsed.repo, "skills");
});

test("canonicalTreeUrl uses the configured URL base for owner/repo shorthand sources", () => {
  const previousBaseUrl = process.env.SKM_GITHUB_URL_BASE;
  process.env.SKM_GITHUB_URL_BASE = "https://example.com";

  try {
    const parsed = parseSource("example/skills");
    assert.equal(
      canonicalTreeUrl(parsed, "main", "skills/hello-skill"),
      "https://example.com/example/skills/tree/main/skills/hello-skill",
    );
  } finally {
    if (previousBaseUrl === undefined) {
      delete process.env.SKM_GITHUB_URL_BASE;
    } else {
      process.env.SKM_GITHUB_URL_BASE = previousBaseUrl;
    }
  }
});

test("parseSource accepts a GitHub repo URL as a repo-wide source", () => {
  const parsed = parseSource("https://example.com/example/skills");

  assert.equal(parsed.kind, "github-repo");
  assert.equal(parsed.owner, "example");
  assert.equal(parsed.repo, "skills");
});

test("fetchSkillToTempDir resolves a git ref, validates SKILL.md, and returns the exact commit", async () => {
  const fixture = await createSkillRepoFixture();
  const tempRoot = await createTempDir("skm-fetch-");

  const fetched = await fetchSkillToTempDir(
    {
      source: parseSource("https://example.com/example/skills/tree/main/skills/hello-skill"),
      requestedRef: "main",
      githubBaseUrl: fixture.remoteRoot,
    },
    tempRoot,
  );

  assert.equal(fetched.resolved, fixture.commit);
  assert.equal(path.basename(fetched.skillDir), "hello-skill");
  await fixture.cleanup();
});
