import { readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveCanonicalSkillPathResult, validateCanonicalNameResult } from "./canonical-name.js";
import { errSkm, okSkm, toSkmError, unwrapOrThrow, type SkmResult } from "./errors.js";
import {
  assertRegularFileResult,
  copyDirectoryResult,
  ensureDirResult,
  pathExistsResult,
  removeIfExistsResult,
} from "./fs.js";
import type { MaterializationStrategy } from "./manifest.js";

export type MaterializeSkillOptions = {
  canonicalName: string;
  sourceDir: string;
  generatedSkillsDir: string;
  manifestSource: string;
  resolved: string;
  strategy: MaterializationStrategy;
};

export async function materializeSkill(options: MaterializeSkillOptions): Promise<string> {
  return unwrapOrThrow(await materializeSkillResult(options));
}

export async function materializeSkillResult(
  options: MaterializeSkillOptions,
): Promise<SkmResult<string>> {
  const skillMdResult = await assertRegularFileResult(
    path.join(options.sourceDir, "SKILL.md"),
    `Skill source ${options.manifestSource} SKILL.md`,
  );
  if (skillMdResult.isErr()) {
    return errSkm(skillMdResult.error);
  }

  const canonicalNameResult = validateCanonicalNameResult(options.canonicalName);
  if (canonicalNameResult.isErr()) {
    return errSkm(canonicalNameResult.error);
  }

  const outputDirResult = resolveCanonicalSkillPathResult(
    options.generatedSkillsDir,
    canonicalNameResult.value,
  );
  if (outputDirResult.isErr()) {
    return errSkm(outputDirResult.error);
  }

  const outputDir = outputDirResult.value;
  const ensureDirOutcome = await ensureDirResult(options.generatedSkillsDir);
  if (ensureDirOutcome.isErr()) {
    return errSkm(ensureDirOutcome.error);
  }
  const removeOutcome = await removeIfExistsResult(outputDir);
  if (removeOutcome.isErr()) {
    return errSkm(removeOutcome.error);
  }

  if (options.strategy === "link") {
    try {
      await symlink(
        options.sourceDir,
        outputDir,
        process.platform === "win32" ? "junction" : "dir",
      );
      return okSkm(outputDir);
    } catch (error) {
      return errSkm(toSkmError(error));
    }
  }

  const copyOutcome = await copyDirectoryResult(options.sourceDir, outputDir);
  if (copyOutcome.isErr()) {
    return errSkm(copyOutcome.error);
  }

  if (options.strategy === "wrap") {
    const wrappedResult = await wrapSkillMarkdownResult(
      path.join(outputDir, "SKILL.md"),
      canonicalNameResult.value,
    );
    if (wrappedResult.isErr()) {
      return errSkm(wrappedResult.error);
    }
    try {
      await writeFile(path.join(outputDir, "SKILL.md"), wrappedResult.value);
    } catch (error) {
      return errSkm(toSkmError(error));
    }
  } else {
    const outputSkillResult = await pathExistsResult(path.join(outputDir, "SKILL.md"));
    if (outputSkillResult.isErr()) {
      return errSkm(outputSkillResult.error);
    }
    if (!outputSkillResult.value) {
      return errSkm(`Materialized skill at ${outputDir} is missing SKILL.md`, 4);
    }
  }

  return okSkm(outputDir);
}

async function wrapSkillMarkdownResult(
  skillMdPath: string,
  canonicalName: string,
): Promise<SkmResult<string>> {
  let raw: string;
  try {
    raw = await readFile(skillMdPath, "utf8");
  } catch (error) {
    return errSkm(toSkmError(error));
  }

  if (!raw.startsWith("---\n")) {
    return okSkm(
      [
        "---",
        `name: ${canonicalName}`,
        "description: Materialized by skm",
        "---",
        "",
        raw.trimEnd(),
        "",
      ].join("\n"),
    );
  }

  const endIndex = raw.indexOf("\n---", 4);
  if (endIndex === -1) {
    return okSkm(`${raw.trimEnd()}\n`);
  }

  const frontmatter = raw.slice(4, endIndex).split("\n");
  const body = raw.slice(endIndex + 5).replace(/^\n/, "");
  let replacedName = false;
  const nextFrontmatter = frontmatter.map((line) => {
    if (line.startsWith("name:")) {
      replacedName = true;
      return `name: ${canonicalName}`;
    }
    return line;
  });
  if (!replacedName) {
    nextFrontmatter.unshift(`name: ${canonicalName}`);
  }

  return okSkm(["---", ...nextFrontmatter, "---", "", body.trimEnd(), ""].join("\n"));
}
