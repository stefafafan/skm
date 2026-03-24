import { readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeTry } from "neverthrow";

import { resolveCanonicalSkillPathResult, validateCanonicalNameResult } from "#src/canonical-name.js";
import {
  errSkm,
  fromSkmPromise,
  okSkm,
  toSkmError,
  unwrapOrThrow,
  type SkmError,
  type SkmResult,
} from "#src/errors.js";
import {
  assertRegularFileResult,
  copyDirectoryResult,
  ensureDirResult,
  pathExistsResult,
  removeIfExistsResult,
} from "#src/fs.js";
import type { MaterializationStrategy } from "#src/manifest.js";

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
  return safeTry<string, SkmError>(async function* () {
    yield* await assertRegularFileResult(
      path.join(options.sourceDir, "SKILL.md"),
      `Skill source ${options.manifestSource} SKILL.md`,
    );

    const canonicalName = yield* validateCanonicalNameResult(options.canonicalName);
    const outputDir = yield* resolveCanonicalSkillPathResult(
      options.generatedSkillsDir,
      canonicalName,
    );

    yield* await ensureDirResult(options.generatedSkillsDir);
    yield* await removeIfExistsResult(outputDir);

    if (options.strategy === "link") {
      yield* fromSkmPromise(
        symlink(options.sourceDir, outputDir, process.platform === "win32" ? "junction" : "dir"),
        toSkmError,
      );
      return okSkm(outputDir);
    }

    yield* await copyDirectoryResult(options.sourceDir, outputDir);

    if (options.strategy === "wrap") {
      const wrappedSkill = yield* await wrapSkillMarkdownResult(
        path.join(outputDir, "SKILL.md"),
        canonicalName,
      );
      yield* fromSkmPromise(writeFile(path.join(outputDir, "SKILL.md"), wrappedSkill), toSkmError);
      return okSkm(outputDir);
    }

    const outputSkillExists = yield* await pathExistsResult(path.join(outputDir, "SKILL.md"));
    if (!outputSkillExists) {
      return errSkm(`Materialized skill at ${outputDir} is missing SKILL.md`, 4);
    }

    return okSkm(outputDir);
  });
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
