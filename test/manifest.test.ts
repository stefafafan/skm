import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

import {
  DEFAULT_OUTPUT_DIR,
  initManifest,
  initLockfile,
  readLockfile,
  readManifest,
  writeLockfile,
  writeManifest,
} from "../src/manifest";
import { createTempDir, readJsonFile, writeJsonFile } from "./helpers/fixture";

test("initManifest writes an empty manifest", async () => {
  const root = await createTempDir("skm-manifest-");
  const manifestPath = path.join(root, "skills.json");

  await initManifest(manifestPath, false);

  const manifest = await readJsonFile<{
    outputDir: string;
    skills: Record<string, unknown>;
  }>(manifestPath);
  assert.equal(manifest.outputDir, ".agents/skills");
  assert.deepEqual(manifest.skills, {});
});

test("readManifest defaults outputDir when it is not present", async () => {
  const root = await createTempDir("skm-manifest-");
  const manifestPath = path.join(root, "skills.json");
  await mkdir(root, { recursive: true });

  await writeJsonFile(manifestPath, {
    skills: {},
  });

  const manifest = await readManifest(manifestPath);
  assert.equal(manifest.outputDir, ".agents/skills");
  assert.deepEqual(manifest.skills, {});
});

test("initManifest --force preserves an existing outputDir when none is provided", async () => {
  const root = await createTempDir("skm-manifest-");
  const manifestPath = path.join(root, "skills.json");
  await mkdir(root, { recursive: true });

  await writeJsonFile(manifestPath, {
    outputDir: ".myagent/skills",
    skills: {
      stale: {
        source: "https://example.com/example/skills/tree/main/skills/stale",
      },
    },
  });

  await initManifest(manifestPath, true);

  const manifest = await readManifest(manifestPath);
  assert.equal(manifest.outputDir, ".myagent/skills");
  assert.deepEqual(manifest.skills, {});
});

test("initLockfile writes an empty lockfile", async () => {
  const root = await createTempDir("skm-manifest-");
  const lockfilePath = path.join(root, "skills.lock.json");

  await initLockfile(lockfilePath, false);

  const lockfile = await readJsonFile<{ skills: Record<string, unknown> }>(lockfilePath);
  assert.deepEqual(lockfile.skills, {});
});

test("writeManifest persists intent fields without resolved metadata", async () => {
  const root = await createTempDir("skm-manifest-");
  const manifestPath = path.join(root, "skills.json");
  await mkdir(root, { recursive: true });

  await writeManifest(manifestPath, {
    outputDir: DEFAULT_OUTPUT_DIR,
    skills: {
      "review-code-quality": {
        source: "https://example.com/example/skills/tree/main/skills/hello-skill",
        requested: "main",
        strategy: "wrap",
      },
    },
  });

  const manifest = await readManifest(manifestPath);
  assert.equal(
    manifest.skills["review-code-quality"]?.source,
    "https://example.com/example/skills/tree/main/skills/hello-skill",
  );
  assert.equal(manifest.skills["review-code-quality"]?.requested, "main");
});

test("readManifest rejects malformed nested skill entries", async () => {
  const root = await createTempDir("skm-manifest-");
  const manifestPath = path.join(root, "skills.json");
  await mkdir(root, { recursive: true });

  await writeJsonFile(manifestPath, {
    outputDir: ".agents/skills",
    skills: {
      "review-code-quality": {
        source: 123,
        requested: "main",
      },
    },
  });

  await assert.rejects(
    readManifest(manifestPath),
    /Invalid manifest shape/,
  );
});

test("readLockfile rejects malformed nested skill entries", async () => {
  const root = await createTempDir("skm-manifest-");
  const lockfilePath = path.join(root, "skills.lock.json");
  await mkdir(root, { recursive: true });

  await writeJsonFile(lockfilePath, {
    skills: {
      "review-code-quality": {
        resolved: 123,
        integrity: "sha256-deadbeef",
      },
    },
  });

  await assert.rejects(
    readLockfile(lockfilePath),
    /Invalid lockfile shape/,
  );
});

test("writeLockfile persists resolved metadata separately from the manifest", async () => {
  const root = await createTempDir("skm-manifest-");
  const lockfilePath = path.join(root, "skills.lock.json");
  await mkdir(root, { recursive: true });

  await writeLockfile(lockfilePath, {
    skills: {
      "review-code-quality": {
        resolved: "abc123",
        integrity: "sha256-deadbeef",
      },
    },
  });

  const lockfile = await readLockfile(lockfilePath);
  assert.equal(lockfile.skills["review-code-quality"]?.resolved, "abc123");
  assert.equal(lockfile.skills["review-code-quality"]?.integrity, "sha256-deadbeef");
});
