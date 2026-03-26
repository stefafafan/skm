import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

import { main } from "../../src/index.js";
import { formatUnknownOption } from "../../src/cli/errors.js";
import { normalizeDashPrefixedOptionValues } from "../../src/cli/normalize-argv.js";
import { registerDispatchCommands } from "../../src/cli/dispatch.js";
import { registerCommands } from "../../src/cli/registry.js";
import {
  createGitHubRepoFixture,
  createTempDir,
  readJsonFile,
  runCli,
} from "../helpers/fixture.js";

test("normalizeDashPrefixedOptionValues folds dash-prefixed values into --ref", () => {
  assert.deepEqual(normalizeDashPrefixedOptionValues(["--ref", "-branch"]), ["--ref=-branch"]);
});

test("formatUnknownOption renders long flags with a double dash", () => {
  assert.equal(formatUnknownOption("bogus"), "Unknown option `--bogus`");
});

test("registerCommands forwards to the active dispatch registration helper", () => {
  assert.equal(registerCommands, registerDispatchCommands);
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

test("main uses context.env SKM_GITHUB_BASE_URL for add", async () => {
  const root = await createTempDir("skm-cli-");
  const workspace = path.join(root, "project");
  const home = path.join(root, "home");
  const fixture = await createGitHubRepoFixture([
    {
      path: "skills/hello-skill",
      skillMd: ["---", "name: hello", "description: hello", "---", "", "# Hello", ""].join("\n"),
    },
  ]);
  await mkdir(workspace, { recursive: true });

  assert.equal(runCli(["init", "--project"], { cwd: workspace, env: { HOME: home } }).code, 0);

  const writes = captureProcessWrites();
  try {
    const code = await main(["add", "https://example.com/example/skills", "--project"], {
      cwd: workspace,
      env: {
        ...process.env,
        HOME: home,
        SKM_GITHUB_BASE_URL: fixture.remoteRoot,
      },
      stdoutIsTTY: false,
    });

    assert.equal(code, 0);
    assert.equal(writes.stderr, "");
  } finally {
    writes.restore();
    await fixture.cleanup();
  }

  const manifest = await readJsonFile<{
    skills: Record<string, { source: string }>;
  }>(path.join(workspace, "skills.json"));
  assert.equal(
    manifest.skills["hello-skill"]?.source,
    "https://example.com/example/skills/tree/main/skills/hello-skill",
  );
});

function captureProcessWrites(): {
  stdout: string;
  stderr: string;
  restore: () => void;
} {
  let stdout = "";
  let stderr = "";
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);

  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  }) as typeof process.stderr.write;

  return {
    get stdout() {
      return stdout;
    },
    get stderr() {
      return stderr;
    },
    restore() {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
    },
  };
}
