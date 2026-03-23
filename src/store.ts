import path from "node:path";

import { SkmError } from "./errors";
import { copyDirectory, ensureDir, pathExists } from "./fs";

export async function storeSkill(
  storeDir: string,
  sourceDir: string,
  integrity: string,
): Promise<string> {
  await ensureDir(storeDir);
  const destination = storePath(storeDir, integrity);
  if (!(await pathExists(destination))) {
    await copyDirectory(sourceDir, destination);
  }
  return destination;
}

export function storePath(storeDir: string, integrity: string): string {
  validateIntegrityForStorePath(integrity);

  const destination = path.resolve(storeDir, integrity);
  const relativePath = path.relative(storeDir, destination);
  if (relativePath === ".." || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    throw new SkmError(`Invalid integrity value for store path: ${integrity}`, 2);
  }

  return destination;
}

function validateIntegrityForStorePath(integrity: string): void {
  if (integrity.length === 0 || path.isAbsolute(integrity)) {
    throw new SkmError(`Invalid integrity value for store path: ${integrity}`, 2);
  }

  for (const segment of integrity.split(/[\\/]+/)) {
    if (segment.length === 0 || segment === "." || segment === "..") {
      throw new SkmError(`Invalid integrity value for store path: ${integrity}`, 2);
    }
  }
}
