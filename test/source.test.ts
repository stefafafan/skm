import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";

import {
  canonicalTreeUrl,
  discoverSkillsInRepo,
  fetchSkillToTempDir,
  parseSource,
} from "../src/source";
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

test("fetchSkillToTempDir rejects a symlinked SKILL.md before copying the skill", async () => {
  const root = await createTempDir("skm-fetch-symlink-");
  const workspaceRoot = path.join(root, "workspace");
  const remoteRoot = path.join(root, "remotes");
  const ownerDir = path.join(remoteRoot, "example");
  const bareRepo = path.join(ownerDir, "skills.git");
  const skillDir = path.join(workspaceRoot, "skills", "hello-skill");
  const redirectedFile = path.join(workspaceRoot, "outside.md");
  const tempRoot = await createTempDir("skm-fetch-output-");
  await mkdir(skillDir, { recursive: true });
  await mkdir(ownerDir, { recursive: true });
  await writeFile(redirectedFile, "leave me alone\n");
  await symlink(path.relative(skillDir, redirectedFile), path.join(skillDir, "SKILL.md"));

  git(["init", "-b", "main"], workspaceRoot);
  git(["config", "user.name", "cat"], workspaceRoot);
  git(["config", "user.email", "cat@example.com"], workspaceRoot);
  git(["add", "."], workspaceRoot);
  git(["commit", "-m", "initial"], workspaceRoot);
  git(["init", "--bare", bareRepo], root);
  git(["remote", "add", "origin", bareRepo], workspaceRoot);
  git(["push", "-u", "origin", "main"], workspaceRoot);

  await assert.rejects(
    fetchSkillToTempDir(
      {
        source: parseSource("https://example.com/example/skills/tree/main/skills/hello-skill"),
        requestedRef: "main",
        githubBaseUrl: remoteRoot,
      },
      tempRoot,
    ),
    /SKILL\.md.*symlink/i,
  );
  assert.equal(await readFile(redirectedFile, "utf8"), "leave me alone\n");
  await assert.rejects(access(path.join(tempRoot, "hello-skill")));
  await rm(root, { recursive: true, force: true });
  await rm(tempRoot, { recursive: true, force: true });
});

test("discoverSkillsInRepo rejects a symlinked SKILL.md", async () => {
  const root = await createTempDir("skm-discover-symlink-");
  const skillDir = path.join(root, "skills", "hello-skill");
  const redirectedFile = path.join(root, "outside.md");
  await mkdir(skillDir, { recursive: true });
  await writeFile(redirectedFile, "leave me alone\n");
  await symlink(path.relative(skillDir, redirectedFile), path.join(skillDir, "SKILL.md"));

  await assert.rejects(discoverSkillsInRepo(root), /SKILL\.md.*symlink/i);
  assert.equal(await readFile(redirectedFile, "utf8"), "leave me alone\n");
  await rm(root, { recursive: true, force: true });
});

function git(args: string[], cwd: string): string {
  const gitArgs = args[0] === "commit" ? ["-c", "commit.gpgsign=false", ...args] : args;
  const result = spawnSync("git", gitArgs, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "cat",
      GIT_AUTHOR_EMAIL: "cat@example.com",
      GIT_COMMITTER_NAME: "cat",
      GIT_COMMITTER_EMAIL: "cat@example.com",
    },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}
