import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";

import { createTempDir, readJsonFile, runCli, writeJsonFile } from "../helpers/fixture.js";

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
