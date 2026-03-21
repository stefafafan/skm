import { cp, lstat, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

export async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function removeIfExists(targetPath: string): Promise<void> {
  await rm(targetPath, { recursive: true, force: true });
}

export async function copyDirectory(sourceDir: string, destinationDir: string): Promise<void> {
  await removeIfExists(destinationDir);
  await ensureDir(path.dirname(destinationDir));
  await cp(sourceDir, destinationDir, { recursive: true, preserveTimestamps: true });
}

export async function listFilesRecursive(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      for (const nested of await listFilesRecursive(fullPath)) {
        files.push(path.join(entry.name, nested));
      }
      continue;
    }
    if (entry.isFile() || entry.isSymbolicLink()) {
      files.push(entry.name);
    }
  }

  return files;
}

export async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    return (await lstat(targetPath)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}
