import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

import {
  createGitHubRepoFixture,
  createSkillRepoFixture,
  createTempDir,
  readJsonFile,
  runCli,
} from "../helpers/fixture.js";

test("skm add stores resolved metadata and materializes the wrapped skill", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  const result = runCli(
    [
      "add",
      "https://example.com/example/skills/tree/main/skills/hello-skill",
      "--project",
      "--as",
      "review-code-quality",
      "--ref",
      "main",
    ],
    {
      cwd: workspace,
      env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
    },
  );

  assert.equal(result.code, 0, result.stderr);
  const manifest = await readJsonFile<{
    skills: Record<string, { requested: string; source: string; strategy: string }>;
  }>(path.join(workspace, "skills.json"));
  const lockfile = await readJsonFile<{
    skills: Record<string, { resolved: string; integrity: string }>;
  }>(path.join(workspace, "skills.lock.json"));
  const entry = manifest.skills["review-code-quality"];
  const lockEntry = lockfile.skills["review-code-quality"];
  assert.equal(entry?.requested, "main");
  assert.equal(entry?.strategy, "wrap");
  assert.equal(lockEntry?.resolved, fixture.commit);
  assert.match(lockEntry?.integrity ?? "", /^sha256-/);

  const wrappedSkill = await readFile(
    path.join(workspace, ".agents", "skills", "review-code-quality", "SKILL.md"),
    "utf8",
  );
  assert.match(wrappedSkill, /name: review-code-quality/);
  await fixture.cleanup();
});

test("skm add rejects unsafe canonical names passed with --as", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  const result = runCli(
    [
      "add",
      "https://example.com/example/skills/tree/main/skills/hello-skill",
      "--project",
      "--as",
      "../../escaped-skill",
    ],
    {
      cwd: workspace,
      env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
    },
  );

  assert.equal(result.code, 2);
  assert.match(result.stderr, /invalid canonical name/i);
  await assert.rejects(() => stat(path.join(workspace, "escaped-skill")));
  await fixture.cleanup();
});

test("skm add materializes into the manifest outputDir", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(workspace, { recursive: true });

  assert.equal(
    runCli(["init", "--project", "--outputDir", ".myagent/skills"], {
      cwd: workspace,
      env: { HOME: home },
    }).code,
    0,
  );
  const result = runCli(
    [
      "add",
      "https://example.com/example/skills/tree/main/skills/hello-skill",
      "--project",
      "--as",
      "review-code-quality",
    ],
    {
      cwd: workspace,
      env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
    },
  );

  assert.equal(result.code, 0, result.stderr);
  const wrappedSkill = await readFile(
    path.join(workspace, ".myagent", "skills", "review-code-quality", "SKILL.md"),
    "utf8",
  );
  assert.match(wrappedSkill, /name: review-code-quality/);
  await fixture.cleanup();
});

test("skm add accepts GitHub tree URLs as a source without an explicit --ref", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  const source = "https://example.com/example/skills/tree/main/skills/hello-skill";
  const result = runCli(["add", source, "--project", "--as", "explicit-git"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });

  assert.equal(result.code, 0, result.stderr);
  const manifest = await readJsonFile<{
    skills: Record<string, { source: string; requested: string }>;
  }>(path.join(workspace, "skills.json"));
  assert.equal(manifest.skills["explicit-git"]?.source, source);
  assert.equal(manifest.skills["explicit-git"]?.requested, "main");
  await fixture.cleanup();
});

test("skm add rejects refs that start with a dash", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  const result = runCli(
    [
      "add",
      "https://example.com/example/skills/tree/main/skills/hello-skill",
      "--project",
      "--as",
      "explicit-git",
      "--ref",
      "-binjected",
    ],
    {
      cwd: workspace,
      env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
    },
  );

  assert.equal(result.code, 3);
  assert.match(result.stderr, /invalid git ref/i);
  await fixture.cleanup();
});

test("skm add stores slash-containing refs from GitHub tree URLs", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(workspace, { recursive: true });
  git(["checkout", "-b", "feature/foo"], fixture.workspaceRoot);
  git(["push", "origin", "feature/foo"], fixture.workspaceRoot);

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  const source = "https://example.com/example/skills/tree/feature/foo/skills/hello-skill";
  const result = runCli(["add", source, "--project", "--as", "slash-ref-skill"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });

  assert.equal(result.code, 0, result.stderr);
  const manifest = await readJsonFile<{
    skills: Record<string, { source: string; requested: string }>;
  }>(path.join(workspace, "skills.json"));
  assert.equal(manifest.skills["slash-ref-skill"]?.source, source);
  assert.equal(manifest.skills["slash-ref-skill"]?.requested, "feature/foo");
  await fixture.cleanup();
});

test("skm add imports every discovered skill from owner/repo shorthand", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createGitHubRepoFixture([
    {
      path: "skills/hello-skill",
      skillMd: ["---", "name: hello", "description: hello", "---", "", "# Hello", ""].join("\n"),
    },
    {
      path: "nested/review-code-quality",
      skillMd: ["---", "name: review", "description: review", "---", "", "# Review", ""].join("\n"),
    },
  ]);
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  const result = runCli(["add", "example/skills", "--project"], {
    cwd: workspace,
    env: {
      HOME: home,
      SKM_GITHUB_BASE_URL: fixture.remoteRoot,
      SKM_GITHUB_URL_BASE: "https://example.com",
    },
  });

  assert.equal(result.code, 0, result.stderr);
  const manifest = await readJsonFile<{
    skills: Record<string, { source: string; requested: string }>;
  }>(path.join(workspace, "skills.json"));
  const lockfile = await readJsonFile<{
    skills: Record<string, { resolved: string; integrity: string }>;
  }>(path.join(workspace, "skills.lock.json"));
  assert.deepEqual(Object.keys(manifest.skills).sort(), ["hello-skill", "review-code-quality"]);
  assert.deepEqual(Object.keys(lockfile.skills).sort(), ["hello-skill", "review-code-quality"]);
  assert.equal(
    manifest.skills["hello-skill"]?.source,
    "https://example.com/example/skills/tree/main/skills/hello-skill",
  );
  assert.equal(
    manifest.skills["review-code-quality"]?.source,
    "https://example.com/example/skills/tree/main/nested/review-code-quality",
  );
  assert.equal(manifest.skills["review-code-quality"]?.requested, "main");
  assert.match(
    await readFile(path.join(workspace, ".agents", "skills", "hello-skill", "SKILL.md"), "utf8"),
    /name: hello-skill/,
  );
  assert.match(
    await readFile(
      path.join(workspace, ".agents", "skills", "review-code-quality", "SKILL.md"),
      "utf8",
    ),
    /name: review-code-quality/,
  );
  await fixture.cleanup();
});

test("skm add persists canonical tree URLs from SKM_GITHUB_BASE_URL for repo-wide imports", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createGitHubRepoFixture([
    {
      path: "skills/hello-skill",
      skillMd: ["---", "name: hello", "description: hello", "---", "", "# Hello", ""].join("\n"),
    },
  ]);
  await mkdir(workspace, { recursive: true });
  await mkdir(home, { recursive: true });
  await writeFile(
    path.join(home, ".gitconfig"),
    [`[url "${fixture.remoteRoot}/"]`, "  insteadOf = https://example.com/"].join("\n"),
  );

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  const result = runCli(["add", "example/skills", "--project"], {
    cwd: workspace,
    env: {
      HOME: home,
      SKM_GITHUB_BASE_URL: "https://example.com",
    },
  });

  assert.equal(result.code, 0, result.stderr);
  const manifest = await readJsonFile<{
    skills: Record<string, { source: string; requested: string }>;
  }>(path.join(workspace, "skills.json"));
  assert.equal(
    manifest.skills["hello-skill"]?.source,
    "https://example.com/example/skills/tree/main/skills/hello-skill",
  );
  assert.equal(manifest.skills["hello-skill"]?.requested, "main");
  await fixture.cleanup();
});

test("skm add imports repo-wide skills from the remote default branch when it is not main", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createGitHubRepoFixture(
    [
      {
        path: "skills/hello-skill",
        skillMd: ["---", "name: hello", "description: hello", "---", "", "# Hello", ""].join("\n"),
      },
    ],
    { defaultBranch: "master" },
  );
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  const result = runCli(["add", "example/skills", "--project"], {
    cwd: workspace,
    env: {
      HOME: home,
      SKM_GITHUB_BASE_URL: fixture.remoteRoot,
      SKM_GITHUB_URL_BASE: "https://example.com",
    },
  });

  assert.equal(result.code, 0, result.stderr);
  const manifest = await readJsonFile<{
    skills: Record<string, { source: string; requested: string }>;
  }>(path.join(workspace, "skills.json"));
  assert.equal(
    manifest.skills["hello-skill"]?.source,
    "https://example.com/example/skills/tree/master/skills/hello-skill",
  );
  assert.equal(manifest.skills["hello-skill"]?.requested, "master");
  await fixture.cleanup();
});

test("skm add imports every discovered skill from a GitHub repo URL", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createGitHubRepoFixture([
    {
      path: "skills/hello-skill",
      skillMd: ["---", "name: hello", "description: hello", "---", "", "# Hello", ""].join("\n"),
    },
    {
      path: "skills/commit-message-writer",
      skillMd: ["---", "name: commit", "description: commit", "---", "", "# Commit", ""].join("\n"),
    },
  ]);
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  const result = runCli(["add", "https://example.com/example/skills", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });

  assert.equal(result.code, 0, result.stderr);
  const manifest = await readJsonFile<{ skills: Record<string, { source: string }> }>(
    path.join(workspace, "skills.json"),
  );
  assert.deepEqual(Object.keys(manifest.skills).sort(), ["commit-message-writer", "hello-skill"]);
  assert.equal(
    manifest.skills["commit-message-writer"]?.source,
    "https://example.com/example/skills/tree/main/skills/commit-message-writer",
  );
  await fixture.cleanup();
});

test("skm add rejects --as for repo-wide imports", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  const result = runCli(["add", "example/skills", "--project", "--as", "one-name"], {
    cwd: workspace,
    env: { HOME: home },
  });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /--as is not supported for repo-wide imports/i);
});

test("skm add fails when repo-wide imports discover duplicate basenames", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createGitHubRepoFixture([
    {
      path: "skills/shared-name",
      skillMd: ["---", "name: one", "description: one", "---", "", "# One", ""].join("\n"),
    },
    {
      path: "nested/shared-name",
      skillMd: ["---", "name: two", "description: two", "---", "", "# Two", ""].join("\n"),
    },
  ]);
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  const result = runCli(["add", "example/skills", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });

  assert.equal(result.code, 5);
  assert.match(result.stderr, /duplicate canonical name/i);
  await fixture.cleanup();
});

test("skm add rejects repo-wide imports that discover unsafe canonical names", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createGitHubRepoFixture([
    {
      path: "skills/..\\escaped-skill",
      skillMd: ["---", "name: bad", "description: bad", "---", "", "# Bad", ""].join("\n"),
    },
  ]);
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  const result = runCli(["add", "example/skills", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /invalid canonical name/i);
  await fixture.cleanup();
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
