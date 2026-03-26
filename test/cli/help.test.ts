import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

import { createTempDir, runCli } from "../helpers/fixture.js";

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

for (const helpCase of [
  {
    command: "init",
    usage: /Usage: skm init \[--project\|--global] \[--force] \[--output-dir <path>]/i,
    detail: /--output-dir, --outputDir <path>/i,
  },
  {
    command: "remove",
    usage: /Usage: skm remove <name> \[--project\|--global]/i,
    detail: /- --project/i,
  },
  {
    command: "rename",
    usage: /Usage: skm rename <old-name> <new-name> \[--project\|--global]/i,
    detail: /- --global/i,
  },
  {
    command: "install",
    usage: /Usage: skm install \[--project\|--global]/i,
    detail: /Options:/i,
  },
  {
    command: "update",
    usage: /Usage: skm update \[name] \[--project\|--global] \[--force]/i,
    detail: /--force/i,
  },
  {
    command: "list",
    usage: /Usage: skm list \[--project\|--global] \[--all]/i,
    detail: /--all/i,
  },
  {
    command: "inspect",
    usage: /Usage: skm inspect <name> \[--project\|--global]/i,
    detail: /- --project/i,
  },
] as const) {
  test(`skm help ${helpCase.command} prints command-specific usage`, async () => {
    const root = await createTempDir("skm-cli-");
    const workspace = path.join(root, "project");
    await mkdir(workspace, { recursive: true });

    const result = runCli(["help", helpCase.command], {
      cwd: workspace,
      env: { HOME: path.join(root, "home") },
    });

    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, helpCase.usage);
    assert.match(result.stdout, helpCase.detail);
  });
}
