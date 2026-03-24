import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";

import {
  createGitHubRepoFixture,
  createSkillRepoFixture,
  createTempDir,
  readJsonFile,
  runCli,
  writeJsonFile,
} from "./helpers/fixture.js";

test("skm --help prints top-level usage", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  await mkdir(workspace, { recursive: true });

  const result = runCli(["--help"], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Usage: skm <command>/i);
  assert.match(result.stdout, /Commands:/i);
  assert.match(result.stdout, /add <source>/i);
});

test("skm help add prints command-specific usage", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  await mkdir(workspace, { recursive: true });

  const result = runCli(["help", "add"], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Usage: skm add <source>/i);
  assert.match(result.stdout, /GitHub repository shorthand/i);
  assert.match(result.stdout, /--as <name>/i);
});

test("skm add --help prints command-specific usage", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  await mkdir(workspace, { recursive: true });

  const result = runCli(["add", "--help"], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Usage: skm add <source>/i);
});

test("skm rejects unknown options instead of treating them as positional arguments", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  await mkdir(workspace, { recursive: true });

  const result = runCli(["add", "--bogus", "example/skills"], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /unknown option/i);
});

test("skm rejects unknown top-level options", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  await mkdir(workspace, { recursive: true });

  const result = runCli(["--bogus"], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /unknown option/i);
});

test("skm version prints the root package version through the built dist CLI entrypoint", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  await mkdir(workspace, { recursive: true });

  const packageJsonPath = path.resolve(process.cwd(), "package.json");
  const expected = await readJsonFile<{ version: string }>(packageJsonPath);
  const result = runCli(["version"], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.trim(), expected.version);
});

test("skm --version prints the package version", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  await mkdir(workspace, { recursive: true });

  const expected = await readJsonFile<{ version: string }>(
    path.resolve(process.cwd(), "package.json"),
  );
  const result = runCli(["--version"], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), expected.version);
});

test("skm -v prints the package version", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  await mkdir(workspace, { recursive: true });

  const expected = await readJsonFile<{ version: string }>(
    path.resolve(process.cwd(), "package.json"),
  );
  const result = runCli(["-v"], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), expected.version);
});

test("skm init creates a project manifest", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  await mkdir(workspace, { recursive: true });

  const result = runCli(["init", "--project"], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.equal(result.code, 0, result.stderr);
  const manifest = await readJsonFile<{
    outputDir: string;
    skills: Record<string, unknown>;
  }>(path.join(workspace, "skills.json"));
  const lockfile = await readJsonFile<{ skills: Record<string, unknown> }>(
    path.join(workspace, "skills.lock.json"),
  );
  assert.equal(manifest.outputDir, ".agents/skills");
  assert.deepEqual(manifest.skills, {});
  assert.deepEqual(lockfile.skills, {});
});

test("skm init --outputDir persists the generated skills directory", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  await mkdir(workspace, { recursive: true });

  const result = runCli(["init", "--project", "--outputDir", ".myagent/skills"], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.equal(result.code, 0, result.stderr);
  const manifest = await readJsonFile<{
    outputDir: string;
    skills: Record<string, unknown>;
  }>(path.join(workspace, "skills.json"));
  assert.equal(manifest.outputDir, ".myagent/skills");
  assert.deepEqual(manifest.skills, {});
});

test("skm init --project rejects an absolute outputDir", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const absoluteOutputDir = path.join(root, "escaped");
  await mkdir(workspace, { recursive: true });

  const result = runCli(["init", "--project", "--outputDir", absoluteOutputDir], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.equal(result.code, 2);
  assert.match(
    result.stderr,
    /Project manifest outputDir must be a relative path inside the project root/,
  );
  await assert.rejects(readFile(path.join(workspace, "skills.json"), "utf8"));
});

test("skm init --project rejects an outputDir that escapes the project root", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  await mkdir(workspace, { recursive: true });

  const result = runCli(["init", "--project", "--outputDir", "../escaped"], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /Project manifest outputDir must stay inside the project root/);
  await assert.rejects(readFile(path.join(workspace, "skills.json"), "utf8"));
});

test("skm init --force --outputDir can recover from an unsafe project outputDir", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  await mkdir(workspace, { recursive: true });
  await writeJsonFile(path.join(workspace, "skills.json"), {
    outputDir: "../escaped",
    skills: { stale: {} },
  });
  await writeJsonFile(path.join(workspace, "skills.lock.json"), {
    skills: { stale: {} },
  });

  const result = runCli(["init", "--project", "--force", "--outputDir", ".myagent/skills"], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.equal(result.code, 0, result.stderr);
  const manifest = await readJsonFile<{
    outputDir: string;
    skills: Record<string, unknown>;
  }>(path.join(workspace, "skills.json"));
  assert.equal(manifest.outputDir, ".myagent/skills");
  assert.deepEqual(manifest.skills, {});
});

test("skm init --force rewrites an existing project manifest and preserves outputDir", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  await mkdir(workspace, { recursive: true });

  assert.equal(
    runCli(["init", "--project", "--outputDir", ".myagent/skills"], {
      cwd: workspace,
      env: { HOME: path.join(root, "home") },
    }).code,
    0,
  );
  let manifest = await readJsonFile<{
    outputDir: string;
    skills: Record<string, unknown>;
  }>(path.join(workspace, "skills.json"));
  manifest.skills = {
    stale: {
      source: "https://example.com/example/skills/tree/main/skills/stale",
    },
  };
  await writeJsonFile(path.join(workspace, "skills.json"), manifest);

  const result = runCli(["init", "--project", "--force"], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.equal(result.code, 0, result.stderr);
  manifest = await readJsonFile<{
    outputDir: string;
    skills: Record<string, unknown>;
  }>(path.join(workspace, "skills.json"));
  assert.equal(manifest.outputDir, ".myagent/skills");
  assert.deepEqual(manifest.skills, {});
});

test("skm init --force --outputDir overrides an existing outputDir", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  await mkdir(workspace, { recursive: true });

  assert.equal(
    runCli(["init", "--project", "--outputDir", ".myagent/skills"], {
      cwd: workspace,
      env: { HOME: path.join(root, "home") },
    }).code,
    0,
  );

  const result = runCli(["init", "--project", "--force", "--outputDir", ".claude/skills"], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.equal(result.code, 0, result.stderr);
  const manifest = await readJsonFile<{
    outputDir: string;
    skills: Record<string, unknown>;
  }>(path.join(workspace, "skills.json"));
  assert.equal(manifest.outputDir, ".claude/skills");
  assert.deepEqual(manifest.skills, {});
});

test("skm init --global keeps allowing an absolute outputDir", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const absoluteOutputDir = path.join(root, "global-skills");
  await mkdir(workspace, { recursive: true });

  const result = runCli(["init", "--global", "--outputDir", absoluteOutputDir], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.equal(result.code, 0, result.stderr);
  const manifest = await readJsonFile<{
    outputDir: string;
    skills: Record<string, unknown>;
  }>(path.join(root, "home", ".config", "skm", "skills.json"));
  assert.equal(manifest.outputDir, absoluteOutputDir);
});

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

test("skm install rebuilds generated output from the stored manifest entry", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  assert.equal(
    runCli(
      ["add", "https://example.com/example/skills/tree/main/skills/hello-skill", "--project"],
      {
        cwd: workspace,
        env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
      },
    ).code,
    0,
  );

  await rm(path.join(workspace, ".agents"), { recursive: true, force: true });
  const result = runCli(["install", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });

  assert.equal(result.code, 0, result.stderr);
  const rebuiltSkill = await readFile(
    path.join(workspace, ".agents", "skills", "hello-skill", "SKILL.md"),
    "utf8",
  );
  assert.match(rebuiltSkill, /name: hello-skill/);
  await fixture.cleanup();
});

test("skm install re-fetches slash-containing tree refs when the store is missing", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(workspace, { recursive: true });
  git(["checkout", "-b", "feature/foo"], fixture.workspaceRoot);
  git(["push", "origin", "feature/foo"], fixture.workspaceRoot);

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  const source = "https://example.com/example/skills/tree/feature/foo/skills/hello-skill";
  const addResult = runCli(["add", source, "--project", "--as", "slash-ref-skill"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });
  assert.equal(addResult.code, 0, addResult.stderr);

  await rm(path.join(workspace, ".skm", "store"), { recursive: true, force: true });
  await rm(path.join(workspace, ".agents"), { recursive: true, force: true });

  const installResult = runCli(["install", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });

  assert.equal(installResult.code, 0, installResult.stderr);
  const rebuiltSkill = await readFile(
    path.join(workspace, ".agents", "skills", "slash-ref-skill", "SKILL.md"),
    "utf8",
  );
  assert.match(rebuiltSkill, /name: slash-ref-skill/);
  await fixture.cleanup();
});

test("skm install rejects lockfile integrity values that traverse outside the store", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  assert.equal(
    runCli(
      ["add", "https://example.com/example/skills/tree/main/skills/hello-skill", "--project"],
      {
        cwd: workspace,
        env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
      },
    ).code,
    0,
  );

  const poisonedStoreTarget = path.join(workspace, "payload");
  await mkdir(poisonedStoreTarget, { recursive: true });
  await writeJsonFile(path.join(workspace, "skills.lock.json"), {
    skills: {
      "hello-skill": {
        resolved: fixture.commit,
        integrity: "../../payload",
      },
    },
  });
  await rm(path.join(workspace, ".agents"), { recursive: true, force: true });
  await writeJsonFile(path.join(poisonedStoreTarget, "nested.json"), { poisoned: true });
  await writeFile(
    path.join(poisonedStoreTarget, "SKILL.md"),
    ["---", "name: poisoned", "description: poisoned", "---", "", "# Payload", ""].join("\n"),
  );

  const result = runCli(["install", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /invalid integrity/i);
  await assert.rejects(() => stat(path.join(workspace, ".agents", "skills", "hello-skill")));
  await fixture.cleanup();
});

test("skm install resolves manual manifest edits into the lockfile and prunes removed skills", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  await writeJsonFile(path.join(workspace, "skills.json"), {
    skills: {
      "manual-skill": {
        source: "https://example.com/example/skills/tree/main/skills/hello-skill",
        requested: "main",
        strategy: "wrap",
      },
    },
  });

  const firstInstall = runCli(["install", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });
  assert.equal(firstInstall.code, 0, firstInstall.stderr);

  const lockfile = await readJsonFile<{
    skills: Record<string, { resolved: string; integrity: string }>;
  }>(path.join(workspace, "skills.lock.json"));
  assert.equal(lockfile.skills["manual-skill"]?.resolved, fixture.commit);
  assert.match(lockfile.skills["manual-skill"]?.integrity ?? "", /^sha256-/);
  assert.match(
    await readFile(path.join(workspace, ".agents", "skills", "manual-skill", "SKILL.md"), "utf8"),
    /name: manual-skill/,
  );

  await writeJsonFile(path.join(workspace, "skills.json"), { skills: {} });
  const secondInstall = runCli(["install", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });
  assert.equal(secondInstall.code, 0, secondInstall.stderr);

  const nextLockfile = await readJsonFile<{ skills: Record<string, unknown> }>(
    path.join(workspace, "skills.lock.json"),
  );
  assert.deepEqual(nextLockfile.skills, {});
  await assert.rejects(() => stat(path.join(workspace, ".agents", "skills", "manual-skill")));
  await fixture.cleanup();
});

test("skm install rejects unsafe canonical names from the manifest", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  await writeJsonFile(path.join(workspace, "skills.json"), {
    skills: {
      "../../escaped-skill": {
        source: "https://example.com/example/skills/tree/main/skills/hello-skill",
        requested: "main",
        strategy: "wrap",
      },
    },
  });

  const result = runCli(["install", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /invalid canonical name/i);
  await assert.rejects(() => stat(path.join(workspace, "escaped-skill")));
  await fixture.cleanup();
});

test("skm update refreshes moving refs and skm list marks project overrides", async () => {
  const root = await createTempDir("skm-cli-");
  const project = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(project, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: project, env: { HOME: home } }).code, 0);
  assert.equal(runCli(["init", "--global"], { cwd: project, env: { HOME: home } }).code, 0);
  assert.equal(
    runCli(
      [
        "add",
        "https://example.com/example/skills/tree/main/skills/hello-skill",
        "--global",
        "--as",
        "shared-skill",
      ],
      {
        cwd: project,
        env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
      },
    ).code,
    0,
  );
  assert.equal(
    runCli(
      [
        "add",
        "https://example.com/example/skills/tree/main/skills/hello-skill",
        "--project",
        "--as",
        "shared-skill",
      ],
      {
        cwd: project,
        env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
      },
    ).code,
    0,
  );

  const previousLockfile = await readJsonFile<{ skills: Record<string, { resolved: string }> }>(
    path.join(project, "skills.lock.json"),
  );
  const nextCommit = fixture.updateSkill({
    skillMd: [
      "---",
      "name: upstream-hello",
      "description: Updated",
      "---",
      "",
      "# Hello Skill",
      "",
      "Updated.",
      "",
    ].join("\n"),
  });

  const updateResult = runCli(["update", "shared-skill", "--project"], {
    cwd: project,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });
  assert.equal(updateResult.code, 0, updateResult.stderr);

  const nextLockfile = await readJsonFile<{ skills: Record<string, { resolved: string }> }>(
    path.join(project, "skills.lock.json"),
  );
  assert.notEqual(
    previousLockfile.skills["shared-skill"]?.resolved,
    nextLockfile.skills["shared-skill"]?.resolved,
  );
  assert.equal(nextLockfile.skills["shared-skill"]?.resolved, nextCommit);

  const listResult = runCli(["list", "--all"], {
    cwd: project,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });
  assert.equal(listResult.code, 0, listResult.stderr);
  assert.match(listResult.stdout, /shared-skill\s+project.+active/);
  assert.match(listResult.stdout, /shared-skill\s+global.+overridden/);
  await fixture.cleanup();
});

test("skm treats scope flags after -- as positional-only", async () => {
  const root = await createTempDir("skm-cli-");
  const project = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(project, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: project, env: { HOME: home } }).code, 0);
  assert.equal(runCli(["init", "--global"], { cwd: project, env: { HOME: home } }).code, 0);
  assert.equal(
    runCli(
      [
        "add",
        "https://example.com/example/skills/tree/main/skills/hello-skill",
        "--global",
        "--as",
        "shared-skill",
      ],
      {
        cwd: project,
        env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
      },
    ).code,
    0,
  );
  assert.equal(
    runCli(
      [
        "add",
        "https://example.com/example/skills/tree/main/skills/hello-skill",
        "--project",
        "--as",
        "shared-skill",
      ],
      {
        cwd: project,
        env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
      },
    ).code,
    0,
  );

  const terminatedScopeResult = runCli(["list", "--", "--global"], {
    cwd: project,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });
  assert.equal(terminatedScopeResult.code, 0, terminatedScopeResult.stderr);
  assert.match(terminatedScopeResult.stdout, /shared-skill\s+project.+active/);
  assert.doesNotMatch(terminatedScopeResult.stdout, /shared-skill\s+global.+active/);

  const globalScopeResult = runCli(["list", "--global"], {
    cwd: project,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });
  assert.equal(globalScopeResult.code, 0, globalScopeResult.stderr);
  assert.match(globalScopeResult.stdout, /shared-skill\s+global.+active/);
  await fixture.cleanup();
});

test("skm update skips fixed commit refs unless --force is supplied", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  assert.equal(
    runCli(
      [
        "add",
        "https://example.com/example/skills/tree/main/skills/hello-skill",
        "--project",
        "--as",
        "pinned-skill",
        "--ref",
        fixture.commit,
      ],
      {
        cwd: workspace,
        env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
      },
    ).code,
    0,
  );

  fixture.updateSkill({
    skillMd: [
      "---",
      "name: upstream-hello",
      "description: Updated later",
      "---",
      "",
      "# Hello Skill",
      "",
      "Updated.",
      "",
    ].join("\n"),
  });

  const updateResult = runCli(["update", "pinned-skill", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });
  assert.equal(updateResult.code, 0, updateResult.stderr);
  const manifest = await readJsonFile<{ skills: Record<string, { requested: string }> }>(
    path.join(workspace, "skills.json"),
  );
  const lockfile = await readJsonFile<{ skills: Record<string, { resolved: string }> }>(
    path.join(workspace, "skills.lock.json"),
  );
  assert.equal(manifest.skills["pinned-skill"]?.requested, fixture.commit);
  assert.equal(lockfile.skills["pinned-skill"]?.resolved, fixture.commit);
  await fixture.cleanup();
});

test("skm update reports an error for a missing skill name", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);

  const result = runCli(["update", "missing-skill", "--project"], {
    cwd: workspace,
    env: { HOME: home },
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Skill missing-skill not found in project scope/);
});

test("skm inspect shows override state and skm remove deletes the generated skill directory", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  assert.equal(
    runCli(
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
    ).code,
    0,
  );

  const inspectResult = runCli(["inspect", "review-code-quality", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });
  assert.equal(inspectResult.code, 0, inspectResult.stderr);
  assert.match(inspectResult.stdout, /materialized path:/i);
  assert.match(inspectResult.stdout, /overridden by project skill: no/i);

  const removeResult = runCli(["remove", "review-code-quality", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });
  assert.equal(removeResult.code, 0, removeResult.stderr);
  const missingResult = runCli(["inspect", "review-code-quality", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });
  assert.equal(missingResult.code, 1);
  await fixture.cleanup();
});

test("skm rename changes the manifest key and rematerializes the wrapped skill", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  assert.equal(
    runCli(
      ["add", "https://example.com/example/skills/tree/main/skills/hello-skill", "--project"],
      {
        cwd: workspace,
        env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
      },
    ).code,
    0,
  );

  const renameResult = runCli(["rename", "hello-skill", "review-code-quality", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });
  assert.equal(renameResult.code, 0, renameResult.stderr);

  const manifest = await readJsonFile<{ skills: Record<string, { source: string }> }>(
    path.join(workspace, "skills.json"),
  );
  const lockfile = await readJsonFile<{
    skills: Record<string, { resolved: string; integrity: string }>;
  }>(path.join(workspace, "skills.lock.json"));
  assert.equal(manifest.skills["hello-skill"], undefined);
  assert.equal(
    manifest.skills["review-code-quality"]?.source,
    "https://example.com/example/skills/tree/main/skills/hello-skill",
  );
  assert.equal(lockfile.skills["hello-skill"], undefined);
  assert.equal(lockfile.skills["review-code-quality"]?.resolved, fixture.commit);

  const renamedSkill = await readFile(
    path.join(workspace, ".agents", "skills", "review-code-quality", "SKILL.md"),
    "utf8",
  );
  assert.match(renamedSkill, /name: review-code-quality/);
  const oldInspect = runCli(["inspect", "hello-skill", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });
  assert.equal(oldInspect.code, 1);
  await fixture.cleanup();
});

test("skm rename rejects unsafe target canonical names", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  assert.equal(
    runCli(
      ["add", "https://example.com/example/skills/tree/main/skills/hello-skill", "--project"],
      {
        cwd: workspace,
        env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
      },
    ).code,
    0,
  );

  const result = runCli(["rename", "hello-skill", "../../escaped-skill", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /invalid canonical name/i);
  await assert.rejects(() => stat(path.join(workspace, "escaped-skill")));
  await fixture.cleanup();
});

test("skm rename rejects lockfile integrity values that traverse outside the store", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createSkillRepoFixture();
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  assert.equal(
    runCli(
      ["add", "https://example.com/example/skills/tree/main/skills/hello-skill", "--project"],
      {
        cwd: workspace,
        env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
      },
    ).code,
    0,
  );

  const poisonedStoreTarget = path.join(workspace, "payload");
  await mkdir(poisonedStoreTarget, { recursive: true });
  await writeJsonFile(path.join(workspace, "skills.lock.json"), {
    skills: {
      "hello-skill": {
        resolved: fixture.commit,
        integrity: "../../payload",
      },
    },
  });
  await writeFile(
    path.join(poisonedStoreTarget, "SKILL.md"),
    ["---", "name: poisoned", "description: poisoned", "---", "", "# Payload", ""].join("\n"),
  );

  const result = runCli(["rename", "hello-skill", "review-code-quality", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });

  assert.equal(result.code, 2);
  assert.match(result.stderr, /invalid integrity/i);

  const manifest = await readJsonFile<{ skills: Record<string, { source: string }> }>(
    path.join(workspace, "skills.json"),
  );
  const lockfile = await readJsonFile<{
    skills: Record<string, { resolved: string; integrity: string }>;
  }>(path.join(workspace, "skills.lock.json"));
  assert.equal(
    manifest.skills["hello-skill"]?.source,
    "https://example.com/example/skills/tree/main/skills/hello-skill",
  );
  assert.equal(manifest.skills["review-code-quality"], undefined);
  assert.equal(lockfile.skills["hello-skill"]?.integrity, "../../payload");
  assert.equal(lockfile.skills["review-code-quality"], undefined);
  assert.match(
    await readFile(path.join(workspace, ".agents", "skills", "hello-skill", "SKILL.md"), "utf8"),
    /name: hello-skill/,
  );
  await assert.rejects(() =>
    stat(path.join(workspace, ".agents", "skills", "review-code-quality")),
  );
  await fixture.cleanup();
});

test("skm rename fails when the old name does not exist", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  const result = runCli(["rename", "missing", "new-name", "--project"], {
    cwd: workspace,
    env: { HOME: home },
  });

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Skill missing not found/i);
});

test("skm rename fails when the target name already exists", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createGitHubRepoFixture([
    {
      path: "skills/hello-skill",
      skillMd: ["---", "name: hello", "description: hello", "---", "", "# Hello", ""].join("\n"),
    },
    {
      path: "skills/review-code-quality",
      skillMd: ["---", "name: review", "description: review", "---", "", "# Review", ""].join("\n"),
    },
  ]);
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);
  assert.equal(
    runCli(["add", "https://example.com/example/skills", "--project"], {
      cwd: workspace,
      env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
    }).code,
    0,
  );

  const result = runCli(["rename", "hello-skill", "review-code-quality", "--project"], {
    cwd: workspace,
    env: { HOME: home, SKM_GITHUB_BASE_URL: fixture.remoteRoot },
  });

  assert.equal(result.code, 5);
  assert.match(result.stderr, /already exists/i);
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
