import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdir } from "node:fs/promises";

import { resolveScope } from "../src/scope";
import { createTempDir, writeJsonFile } from "./helpers/fixture";

test("resolveScope defaults to project scope when an ancestor skills.json exists", async () => {
  const root = await createTempDir("skm-scope-");
  const projectRoot = path.join(root, "repo");
  const nested = path.join(projectRoot, "packages", "feature");
  await mkdir(nested, { recursive: true });
  await writeJsonFile(path.join(projectRoot, "skills.json"), {
    skills: {},
  });

  const scope = await resolveScope({
    cwd: nested,
    homeDir: path.join(root, "home"),
  });

  assert.equal(scope.kind, "project");
  assert.equal(scope.rootDir, projectRoot);
  assert.equal(scope.manifestPath, path.join(projectRoot, "skills.json"));
  assert.equal(scope.lockfilePath, path.join(projectRoot, "skills.lock.json"));
  assert.equal(scope.generatedSkillsDir, path.join(projectRoot, ".agents", "skills"));
});

test("resolveScope falls back to global scope when there is no project manifest", async () => {
  const root = await createTempDir("skm-scope-");
  const cwd = path.join(root, "workspace");
  await mkdir(cwd, { recursive: true });

  const scope = await resolveScope({
    cwd,
    homeDir: path.join(root, "home"),
  });

  assert.equal(scope.kind, "global");
  assert.equal(scope.manifestPath, path.join(root, "home", ".config", "skm", "skills.json"));
  assert.equal(scope.lockfilePath, path.join(root, "home", ".config", "skm", "skills.lock.json"));
  assert.equal(scope.generatedSkillsDir, path.join(root, "home", ".agents", "skills"));
});
