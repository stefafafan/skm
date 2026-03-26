import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

import { readJsonFile, createTempDir, runCli } from "../helpers/fixture.js";

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
