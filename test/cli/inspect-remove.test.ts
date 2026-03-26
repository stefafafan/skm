import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

import { createSkillRepoFixture, createTempDir, runCli } from "../helpers/fixture.js";

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
