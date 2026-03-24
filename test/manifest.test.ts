import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { SkmError } from "#src/errors.js";
import {
  DEFAULT_OUTPUT_DIR,
  initLockfile,
  initManifest,
  readLockfile,
  readManifest,
  readManifestResult,
  writeLockfile,
  writeManifest,
} from "#src/manifest.js";
import { createTempDir, readJsonFile, writeJsonFile } from "./helpers/fixture.js";

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

  await assert.rejects(readManifest(manifestPath), /Invalid manifest shape/);
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

  await assert.rejects(readLockfile(lockfilePath), /Invalid lockfile shape/);
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

test("readManifestResult returns ok when the manifest is readable", async () => {
  const root = await createTempDir("skm-manifest-result-");
  const manifestPath = path.join(root, "skills.json");
  await mkdir(root, { recursive: true });

  await writeJsonFile(manifestPath, {
    skills: {
      "review-code-quality": {
        source: "https://example.com/example/skills/tree/main/skills/hello-skill",
      },
    },
  });

  const result = await readManifestResult(manifestPath);
  assert(result.isOk());
  const manifest = result.match(
    (value) => value,
    () => {
      throw new Error("expected manifest to resolve");
    },
  );

  assert.equal(manifest.outputDir, DEFAULT_OUTPUT_DIR);
  assert.equal(
    manifest.skills["review-code-quality"]?.source,
    "https://example.com/example/skills/tree/main/skills/hello-skill",
  );
});

test("readManifestResult returns an SkmError when the manifest is missing", async () => {
  const root = await createTempDir("skm-manifest-result-");
  const manifestPath = path.join(root, "skills.json");

  const result = await readManifestResult(manifestPath);
  assert(result.isErr());
  const error = result.match(
    () => {
      throw new Error("expected an error");
    },
    (err) => err,
  );

  assert(error instanceof SkmError);
  assert.equal(error.exitCode, 2);
  assert.match(error.message, /Manifest not found/);
});
