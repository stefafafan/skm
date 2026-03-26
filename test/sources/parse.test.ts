import assert from "node:assert/strict";
import test from "node:test";

import { canonicalTreeUrl } from "../../src/sources/github.js";
import { parseSource } from "../../src/sources/parse.js";

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

test("canonicalTreeUrl preserves the configured URL base", () => {
  const source = parseSource("https://github.example.com/example/skills") as Extract<
    ReturnType<typeof parseSource>,
    { kind: "github-repo" }
  >;

  assert.equal(
    canonicalTreeUrl(source, "main", "skills/hello"),
    "https://github.example.com/example/skills/tree/main/skills/hello",
  );
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
