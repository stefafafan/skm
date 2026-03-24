import path from "node:path";

import { errSkm, okSkm, unwrapOrThrow, type SkmResult } from "./errors.js";
import { copyDirectoryResult, ensureDirResult, pathExistsResult } from "./fs.js";

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
  const ensureResult = await ensureDirResult(storeDir);
  if (ensureResult.isErr()) {
    return errSkm(ensureResult.error);
  }
  const destinationResult = storePathResult(storeDir, integrity);
  if (destinationResult.isErr()) {
    return errSkm(destinationResult.error);
  }
  const destination = destinationResult.value;
  const existsResult = await pathExistsResult(destination);
  if (existsResult.isErr()) {
    return errSkm(existsResult.error);
  }
  if (!existsResult.value) {
    const copyResult = await copyDirectoryResult(sourceDir, destination);
    if (copyResult.isErr()) {
      return errSkm(copyResult.error);
    }
  }
  return okSkm(destination);
}

export function storePath(storeDir: string, integrity: string): string {
  return unwrapOrThrow(storePathResult(storeDir, integrity));
}

export function storePathResult(storeDir: string, integrity: string): SkmResult<string> {
  const integrityResult = validateIntegrityForStorePath(integrity);
  if (integrityResult.isErr()) {
    return errSkm(integrityResult.error);
  }

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
