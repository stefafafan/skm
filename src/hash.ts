import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { safeTry } from "neverthrow";

import { fromSkmPromise, okSkm, unwrapOrThrow, type SkmError, type SkmResult } from "./errors.js";
import { assertRegularFileResult, listFilesRecursiveResult } from "./fs.js";

export async function hashDirectory(dirPath: string): Promise<string> {
  return unwrapOrThrow(await hashDirectoryResult(dirPath));
}

export async function hashDirectoryResult(dirPath: string): Promise<SkmResult<string>> {
  return safeTry<string, SkmError>(async function* () {
    yield* await assertRegularFileResult(
      path.join(dirPath, "SKILL.md"),
      `Skill directory ${dirPath} SKILL.md`,
    );

    const hash = createHash("sha256");
    const files = yield* await listFilesRecursiveResult(dirPath);

    for (const relativePath of files) {
      hash.update(`path:${relativePath}\n`);
      hash.update(yield* fromSkmPromise(readFile(path.join(dirPath, relativePath))));
      hash.update("\n");
    }

    return okSkm(`sha256-${hash.digest("base64")}`);
  });
}
