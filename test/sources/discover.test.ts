import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";

import { discoverSkillsInRepo } from "../../src/sources/discover.js";
import { createTempDir } from "../helpers/fixture.js";

test("discoverSkillsInRepo walks a repository and returns canonical skill directories", async () => {
  const root = await createTempDir("skm-discover-");
  const helloSkillDir = path.join(root, "skills", "hello-skill");
  const byeSkillDir = path.join(root, "nested", "bye-skill");
  await mkdir(helloSkillDir, { recursive: true });
  await mkdir(byeSkillDir, { recursive: true });
  await writeFile(path.join(helloSkillDir, "SKILL.md"), "# hello\n");
  await writeFile(path.join(byeSkillDir, "SKILL.md"), "# bye\n");

  const discovered = await discoverSkillsInRepo(root);

  assert.deepEqual(
    discovered.map((skill) => ({
      relativeDir: skill.relativeDir,
      canonicalName: skill.canonicalName,
    })),
    [
      { relativeDir: "nested/bye-skill", canonicalName: "bye-skill" },
      { relativeDir: "skills/hello-skill", canonicalName: "hello-skill" },
    ],
  );
  await rm(root, { recursive: true, force: true });
});

test("discoverSkillsInRepo rejects a symlinked SKILL.md", async () => {
  const root = await createTempDir("skm-discover-symlink-");
  const skillDir = path.join(root, "skills", "hello-skill");
  const redirectedFile = path.join(root, "outside.md");
  await mkdir(skillDir, { recursive: true });
  await writeFile(redirectedFile, "leave me alone\n");
  await symlink(path.relative(skillDir, redirectedFile), path.join(skillDir, "SKILL.md"));

  await assert.rejects(discoverSkillsInRepo(root), /SKILL\.md.*symlink/i);
  assert.equal(await readFile(redirectedFile, "utf8"), "leave me alone\n");
  await rm(root, { recursive: true, force: true });
});
