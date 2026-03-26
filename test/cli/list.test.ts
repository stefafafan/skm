import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

import { resolveCliScope } from "../../src/cli/global-options.js";
import { createSkillRepoFixture, createTempDir, runCli } from "../helpers/fixture.js";

test("resolveCliScope prefers explicit --global over default discovery", () => {
  assert.equal(resolveCliScope({ global: true, project: false }), "global");
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
