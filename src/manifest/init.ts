import { pathExists } from "../platform/fs.js";
import { fromSkmPromise, type SkmResultAsync, SkmError } from "../shared/errors.js";
import { readManifest, writeLockfile, writeManifest } from "./io.js";
import { DEFAULT_OUTPUT_DIR } from "./types.js";

export async function initManifest(
  manifestPath: string,
  force: boolean,
  outputDir?: string,
): Promise<void> {
  if (!force && (await pathExists(manifestPath))) {
    throw new SkmError(`Manifest already exists at ${manifestPath}`, 5);
  }

  let nextOutputDir = outputDir;
  if (nextOutputDir === undefined && (await pathExists(manifestPath))) {
    try {
      nextOutputDir = (await readManifest(manifestPath)).outputDir;
    } catch {
      nextOutputDir = undefined;
    }
  }

  await writeManifest(manifestPath, {
    outputDir: nextOutputDir ?? DEFAULT_OUTPUT_DIR,
    skills: {},
  });
}

export async function initLockfile(lockfilePath: string, force: boolean): Promise<void> {
  if (!force && (await pathExists(lockfilePath))) {
    throw new SkmError(`Lockfile already exists at ${lockfilePath}`, 5);
  }

  await writeLockfile(lockfilePath, {
    skills: {},
  });
}

export function initManifestResult(
  manifestPath: string,
  force: boolean,
  outputDir?: string,
): SkmResultAsync<void> {
  return fromSkmPromise(initManifest(manifestPath, force, outputDir));
}

export function initLockfileResult(lockfilePath: string, force: boolean): SkmResultAsync<void> {
  return fromSkmPromise(initLockfile(lockfilePath, force));
}
