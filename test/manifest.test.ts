import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

import {
  initManifest,
  initLockfile,
  readLockfile,
  readManifest,
  writeLockfile,
  writeManifest,
} from "../src/manifest";
import { createTempDir, readJsonFile } from "./helpers/fixture";

test("initManifest writes an empty manifest", async () => {
  const root = await createTempDir("skm-manifest-");
  const manifestPath = path.join(root, "skills.json");

  await initManifest(manifestPath, false);

  const manifest = await readJsonFile<{ skills: Record<string, unknown> }>(manifestPath);
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
