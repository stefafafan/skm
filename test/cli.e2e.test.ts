import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdir, readFile, rm, stat } from "node:fs/promises";

import {
  createGitHubRepoFixture,
  createSkillRepoFixture,
  createTempDir,
  readJsonFile,
  runCli,
  writeJsonFile,
} from "./helpers/fixture";

test("skm init creates a project manifest", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  await mkdir(workspace, { recursive: true });

  const result = runCli(["init", "--project"], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.equal(result.code, 0, result.stderr);
  const manifest = await readJsonFile<{ skills: Record<string, unknown> }>(
    path.join(workspace, "skills.json"),
  );
  const lockfile = await readJsonFile<{ skills: Record<string, unknown> }>(
    path.join(workspace, "skills.lock.json"),
  );
  assert.deepEqual(manifest.skills, {});
  assert.deepEqual(lockfile.skills, {});
});

test("skm init --force rewrites an existing project manifest", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  await mkdir(workspace, { recursive: true });

  assert.equal(
    runCli(["init", "--project"], { cwd: workspace, env: { HOME: path.join(root, "home") } }).code,
    0,
  );
  let manifest = await readJsonFile<{ skills: Record<string, unknown> }>(
    path.join(workspace, "skills.json"),
  );
  manifest.skills = { stale: {} };
  await writeJsonFile(path.join(workspace, "skills.json"), manifest);

  const result = runCli(["init", "--project", "--force"], {
    cwd: workspace,
    env: { HOME: path.join(root, "home") },
  });

  assert.equal(result.code, 0, result.stderr);
  manifest = await readJsonFile<{ skills: Record<string, unknown> }>(
    path.join(workspace, "skills.json"),
  );
  assert.deepEqual(manifest.skills, {});
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
