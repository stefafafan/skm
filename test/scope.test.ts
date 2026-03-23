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

test("resolveScope uses the manifest outputDir for project scope", async () => {
  const root = await createTempDir("skm-scope-");
  const projectRoot = path.join(root, "repo");
  const nested = path.join(projectRoot, "packages", "feature");
  await mkdir(nested, { recursive: true });
  await writeJsonFile(path.join(projectRoot, "skills.json"), {
    outputDir: ".myagent/skills",
    skills: {},
  });

  const scope = await resolveScope({
    cwd: nested,
    homeDir: path.join(root, "home"),
  });

  assert.equal(scope.kind, "project");
  assert.equal(scope.generatedSkillsDir, path.join(projectRoot, ".myagent", "skills"));
});

test("resolveScope allows a normalized project outputDir that stays inside the project root", async () => {
  const root = await createTempDir("skm-scope-");
  const projectRoot = path.join(root, "repo");
  const nested = path.join(projectRoot, "packages", "feature");
  await mkdir(nested, { recursive: true });
  await writeJsonFile(path.join(projectRoot, "skills.json"), {
    outputDir: "packages/../.myagent/skills",
    skills: {},
  });

  const scope = await resolveScope({
    cwd: nested,
    homeDir: path.join(root, "home"),
  });

  assert.equal(scope.kind, "project");
  assert.equal(scope.generatedSkillsDir, path.join(projectRoot, ".myagent", "skills"));
});

test("resolveScope rejects an absolute project outputDir", async () => {
  const root = await createTempDir("skm-scope-");
  const projectRoot = path.join(root, "repo");
  const nested = path.join(projectRoot, "packages", "feature");
  await mkdir(nested, { recursive: true });
  await writeJsonFile(path.join(projectRoot, "skills.json"), {
    outputDir: path.join(root, "escaped"),
    skills: {},
  });

  await assert.rejects(
    resolveScope({
      cwd: nested,
      homeDir: path.join(root, "home"),
    }),
    /Project manifest outputDir must be a relative path inside the project root/,
  );
});

test("resolveScope rejects a project outputDir that escapes the project root", async () => {
  const root = await createTempDir("skm-scope-");
  const projectRoot = path.join(root, "repo");
  const nested = path.join(projectRoot, "packages", "feature");
  await mkdir(nested, { recursive: true });
  await writeJsonFile(path.join(projectRoot, "skills.json"), {
    outputDir: "../escaped",
    skills: {},
  });

  await assert.rejects(
    resolveScope({
      cwd: nested,
      homeDir: path.join(root, "home"),
    }),
    /Project manifest outputDir must stay inside the project root/,
  );
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

test("resolveScope keeps the default global generated skills directory when the manifest omits outputDir", async () => {
  const root = await createTempDir("skm-scope-");
  const cwd = path.join(root, "workspace");
  const homeDir = path.join(root, "home");
  await mkdir(cwd, { recursive: true });
  await writeJsonFile(path.join(homeDir, ".config", "skm", "skills.json"), {
    skills: {},
  });

  const scope = await resolveScope({
    cwd,
    homeDir,
  });

  assert.equal(scope.kind, "global");
  assert.equal(scope.generatedSkillsDir, path.join(homeDir, ".agents", "skills"));
});

test("resolveScope keeps allowing an absolute outputDir for global scope", async () => {
  const root = await createTempDir("skm-scope-");
  const cwd = path.join(root, "workspace");
  const homeDir = path.join(root, "home");
  const globalOutputDir = path.join(root, "global-skills");
  await mkdir(cwd, { recursive: true });
  await writeJsonFile(path.join(homeDir, ".config", "skm", "skills.json"), {
    outputDir: globalOutputDir,
    skills: {},
  });

  const scope = await resolveScope({
    cwd,
    homeDir,
  });

  assert.equal(scope.kind, "global");
  assert.equal(scope.generatedSkillsDir, globalOutputDir);
});

test("resolveScope ignores ambient XDG_CONFIG_HOME unless it is passed explicitly", async () => {
  const root = await createTempDir("skm-scope-");
  const cwd = path.join(root, "workspace");
  const previousXdgConfigHome = process.env.XDG_CONFIG_HOME;
  await mkdir(cwd, { recursive: true });
  process.env.XDG_CONFIG_HOME = path.join(root, "ambient-xdg");

  try {
    const scope = await resolveScope({
      cwd,
      homeDir: path.join(root, "home"),
    });

    assert.equal(scope.kind, "global");
    assert.equal(scope.manifestPath, path.join(root, "home", ".config", "skm", "skills.json"));
    assert.equal(scope.lockfilePath, path.join(root, "home", ".config", "skm", "skills.lock.json"));
  } finally {
    if (previousXdgConfigHome === undefined) {
      delete process.env.XDG_CONFIG_HOME;
    } else {
      process.env.XDG_CONFIG_HOME = previousXdgConfigHome;
    }
  }
});
