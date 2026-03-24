import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";

import { hashDirectoryResult } from "../src/hash.js";
import { createTempDir } from "./helpers/fixture.js";

test("hashDirectoryResult returns an err for a symlinked SKILL.md", async () => {
  const root = await createTempDir("skm-hash-symlink-");
  const skillDir = path.join(root, "hello-skill");
  const redirectedFile = path.join(root, "outside.md");
  await mkdir(skillDir, { recursive: true });
  await writeFile(redirectedFile, "leave me alone\n");
  await symlink(path.relative(skillDir, redirectedFile), path.join(skillDir, "SKILL.md"));

  const result = await hashDirectoryResult(skillDir);

  assert.equal(result.isErr(), true);
  assert.match(result._unsafeUnwrapErr().message, /SKILL\.md.*symlink/i);
  assert.equal(await readFile(redirectedFile, "utf8"), "leave me alone\n");
  await rm(root, { recursive: true, force: true });
});
