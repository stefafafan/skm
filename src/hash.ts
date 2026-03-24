import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { errSkm, okSkm, toSkmError, unwrapOrThrow, type SkmResult } from "./errors.js";
import { assertRegularFileResult, listFilesRecursiveResult } from "./fs.js";

export async function hashDirectory(dirPath: string): Promise<string> {
  return unwrapOrThrow(await hashDirectoryResult(dirPath));
}

export async function hashDirectoryResult(dirPath: string): Promise<SkmResult<string>> {
  const skillMdResult = await assertRegularFileResult(
    path.join(dirPath, "SKILL.md"),
    `Skill directory ${dirPath} SKILL.md`,
  );
  if (skillMdResult.isErr()) {
    return errSkm(skillMdResult.error);
  }
  const hash = createHash("sha256");
  const filesResult = await listFilesRecursiveResult(dirPath);
  if (filesResult.isErr()) {
    return errSkm(filesResult.error);
  }

  for (const relativePath of filesResult.value) {
    hash.update(`path:${relativePath}\n`);
    try {
      hash.update(await readFile(path.join(dirPath, relativePath)));
    } catch (error) {
      return errSkm(toSkmError(error));
    }
    hash.update("\n");
  }

  return okSkm(`sha256-${hash.digest("base64")}`);
}
