import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

import { createSkillRepoFixture, createTempDir, readJsonFile, runCli } from "../helpers/fixture.js";

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
