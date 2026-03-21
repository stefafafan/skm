import path from "node:path";

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
  return path.join(storeDir, integrity);
}
