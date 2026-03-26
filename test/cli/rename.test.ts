import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";

import {
  createGitHubRepoFixture,
  createSkillRepoFixture,
  createTempDir,
  readJsonFile,
  runCli,
  writeJsonFile,
} from "../helpers/fixture.js";

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
