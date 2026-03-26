import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import path from "node:path";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";

import {
  createSkillRepoFixture,
  createTempDir,
  readJsonFile,
  runCli,
  writeJsonFile,
} from "../helpers/fixture.js";

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
