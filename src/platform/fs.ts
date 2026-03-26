import { cp, lstat, mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";

import { errSkm, okSkm, toSkmError, unwrapOrThrow, type SkmResult } from "../shared/errors.js";

export async function pathExists(targetPath: string): Promise<boolean> {
  return unwrapOrThrow(await pathExistsResult(targetPath));
}

export async function pathExistsResult(targetPath: string): Promise<SkmResult<boolean>> {
  try {
    await stat(targetPath);
    return okSkm(true);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return okSkm(false);
    }
    return errSkm(toSkmError(error));
  }
}

export async function ensureDir(dirPath: string): Promise<void> {
  unwrapOrThrow(await ensureDirResult(dirPath));
}

export async function ensureDirResult(dirPath: string): Promise<SkmResult<void>> {
  try {
    await mkdir(dirPath, { recursive: true });
    return okSkm(undefined);
  } catch (error) {
    return errSkm(toSkmError(error));
  }
}

export async function removeIfExists(targetPath: string): Promise<void> {
  unwrapOrThrow(await removeIfExistsResult(targetPath));
}

export async function removeIfExistsResult(targetPath: string): Promise<SkmResult<void>> {
  try {
    await rm(targetPath, { recursive: true, force: true });
    return okSkm(undefined);
  } catch (error) {
    return errSkm(toSkmError(error));
  }
}

export async function copyDirectory(sourceDir: string, destinationDir: string): Promise<void> {
  unwrapOrThrow(await copyDirectoryResult(sourceDir, destinationDir));
}

export async function copyDirectoryResult(
  sourceDir: string,
  destinationDir: string,
): Promise<SkmResult<void>> {
  const removeResult = await removeIfExistsResult(destinationDir);
  if (removeResult.isErr()) {
    return removeResult;
  }

  const ensureResult = await ensureDirResult(path.dirname(destinationDir));
  if (ensureResult.isErr()) {
    return ensureResult;
  }

  try {
    await cp(sourceDir, destinationDir, { recursive: true, preserveTimestamps: true });
    return okSkm(undefined);
  } catch (error) {
    return errSkm(toSkmError(error));
  }
}

export async function listFilesRecursive(rootDir: string): Promise<string[]> {
  return unwrapOrThrow(await listFilesRecursiveResult(rootDir));
}

export async function listFilesRecursiveResult(rootDir: string): Promise<SkmResult<string[]>> {
  let entries;
  try {
    entries = await readdir(rootDir, { withFileTypes: true });
  } catch (error) {
    return errSkm(toSkmError(error));
  }
  const files: string[] = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nestedResult = await listFilesRecursiveResult(fullPath);
      if (nestedResult.isErr()) {
        return nestedResult;
      }
      for (const nested of nestedResult.value) {
        files.push(path.join(entry.name, nested));
      }
      continue;
    }
    if (entry.isFile() || entry.isSymbolicLink()) {
      files.push(entry.name);
    }
  }

  return okSkm(files);
}

export async function isDirectory(targetPath: string): Promise<boolean> {
  return unwrapOrThrow(await isDirectoryResult(targetPath));
}

export async function isDirectoryResult(targetPath: string): Promise<SkmResult<boolean>> {
  try {
    return okSkm((await lstat(targetPath)).isDirectory());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return okSkm(false);
    }
    return errSkm(toSkmError(error));
  }
}

export async function assertRegularFile(targetPath: string, description: string): Promise<void> {
  unwrapOrThrow(await assertRegularFileResult(targetPath, description));
}

export async function assertRegularFileResult(
  targetPath: string,
  description: string,
): Promise<SkmResult<void>> {
  try {
    const fileStats = await lstat(targetPath);
    if (fileStats.isFile()) {
      return okSkm(undefined);
    }
    if (fileStats.isSymbolicLink()) {
      return errSkm(`${description} cannot be a symlink`, 4);
    }
    return errSkm(`${description} must be a regular file`, 4);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return errSkm(`${description} is missing`, 4);
    }
    return errSkm(toSkmError(error));
  }
}
