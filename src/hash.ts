import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { listFilesRecursive } from "./fs";

export async function hashDirectory(dirPath: string): Promise<string> {
  const hash = createHash("sha256");
  const files = await listFilesRecursive(dirPath);

  for (const relativePath of files) {
    hash.update(`path:${relativePath}\n`);
    hash.update(await readFile(path.join(dirPath, relativePath)));
    hash.update("\n");
  }

  return `sha256-${hash.digest("base64")}`;
}
