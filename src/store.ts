import path from "node:path";
import { safeTry } from "neverthrow";

import { errSkm, okSkm, unwrapOrThrow, type SkmError, type SkmResult } from "#src/errors.js";
import { copyDirectoryResult, ensureDirResult, pathExistsResult } from "#src/fs.js";

export async function storeSkill(
  storeDir: string,
  sourceDir: string,
  integrity: string,
): Promise<string> {
  return unwrapOrThrow(await storeSkillResult(storeDir, sourceDir, integrity));
}

export async function storeSkillResult(
  storeDir: string,
  sourceDir: string,
  integrity: string,
): Promise<SkmResult<string>> {
  return safeTry<string, SkmError>(async function* () {
    yield* await ensureDirResult(storeDir);
    const destination = yield* storePathResult(storeDir, integrity);
    const destinationExists = yield* await pathExistsResult(destination);

    if (!destinationExists) {
      yield* await copyDirectoryResult(sourceDir, destination);
    }

    return okSkm(destination);
  });
}

export function storePath(storeDir: string, integrity: string): string {
  return unwrapOrThrow(storePathResult(storeDir, integrity));
}

export function storePathResult(storeDir: string, integrity: string): SkmResult<string> {
  return safeTry<string, SkmError>(function* () {
    yield* validateIntegrityForStorePath(integrity);

    const destination = path.resolve(storeDir, integrity);
    const relativePath = path.relative(storeDir, destination);
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativePath)
    ) {
      return errSkm(`Invalid integrity value for store path: ${integrity}`, 2);
    }

    return okSkm(destination);
  });
}

function validateIntegrityForStorePath(integrity: string): SkmResult<void> {
  if (integrity.length === 0 || path.isAbsolute(integrity)) {
    return errSkm(`Invalid integrity value for store path: ${integrity}`, 2);
  }

  for (const segment of integrity.split(/[\\/]+/)) {
    if (segment.length === 0 || segment === "." || segment === "..") {
      return errSkm(`Invalid integrity value for store path: ${integrity}`, 2);
    }
  }

  return okSkm(undefined);
}
