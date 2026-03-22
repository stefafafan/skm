import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";

import { materializeSkill } from "../src/materialize";
import { createTempDir } from "./helpers/fixture";

test("materializeSkill wraps SKILL.md with the canonical name and preserves support files", async () => {
  const root = await createTempDir("skm-materialize-");
  const sourceDir = path.join(root, "source");
  const generatedDir = path.join(root, ".agents", "skills");
  await mkdir(sourceDir, { recursive: true });
  await writeFile(
    path.join(sourceDir, "SKILL.md"),
    [
      "---",
      "name: upstream-hello",
      "description: Upstream greeting skill",
      "---",
      "",
      "# Hello",
      "",
    ].join("\n"),
  );
  await writeFile(path.join(sourceDir, "notes.txt"), "notes\n");

  const outputDir = await materializeSkill({
    canonicalName: "review-code-quality",
    sourceDir,
    generatedSkillsDir: generatedDir,
    manifestSource: "https://example.com/example/skills/tree/main/skills/hello-skill",
    resolved: "abc123def456",
    strategy: "wrap",
  });

  const wrappedSkill = await readFile(path.join(outputDir, "SKILL.md"), "utf8");
  const copiedNote = await readFile(path.join(outputDir, "notes.txt"), "utf8");
  assert.match(wrappedSkill, /name: review-code-quality/);
  assert.match(
    wrappedSkill,
    /https:\/\/example\.com\/example\/skills\/tree\/main\/skills\/hello-skill/,
  );
  assert.equal(copiedNote, "notes\n");
  await assert.rejects(access(path.join(outputDir, ".skm-meta.json")));
});
