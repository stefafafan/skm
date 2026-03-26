import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ensureDir, pathExists } from "../platform/fs.js";
import { fromSkmPromise, type SkmResultAsync, SkmError } from "../shared/errors.js";
import { parseLockEntry, parseManifestEntry } from "./parse.js";
import {
  DEFAULT_OUTPUT_DIR,
  type SkillsLockfile,
  type SkillsManifest,
  type SkillLockEntry,
  type SkillManifestEntry,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function readManifest(manifestPath: string): Promise<SkillsManifest> {
  if (!(await pathExists(manifestPath))) {
    throw new SkmError(`Manifest not found at ${manifestPath}`, 2);
  }

  const raw = await readFile(manifestPath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new SkmError(`Invalid manifest JSON at ${manifestPath}: ${(error as Error).message}`, 2);
  }

  if (!isRecord(parsed) || !isRecord(parsed.skills)) {
    throw new SkmError(`Invalid manifest shape at ${manifestPath}`, 2);
  }

  if (parsed.outputDir !== undefined && typeof parsed.outputDir !== "string") {
    throw new SkmError(`Invalid manifest shape at ${manifestPath}: outputDir must be a string`, 2);
  }

  const skills: Record<string, SkillManifestEntry> = {};
  for (const [name, entry] of Object.entries(parsed.skills)) {
    skills[name] = parseManifestEntry(manifestPath, name, entry);
  }

  return {
    outputDir: parsed.outputDir ?? DEFAULT_OUTPUT_DIR,
    skills,
  };
}

export async function writeManifest(manifestPath: string, manifest: SkillsManifest): Promise<void> {
  await ensureDir(path.dirname(manifestPath));
  await writeFile(
    manifestPath,
    `${JSON.stringify({ outputDir: manifest.outputDir, skills: manifest.skills }, null, 2)}\n`,
  );
}

export function readManifestResult(manifestPath: string): SkmResultAsync<SkillsManifest> {
  return fromSkmPromise(readManifest(manifestPath));
}

export function writeManifestResult(
  manifestPath: string,
  manifest: SkillsManifest,
): SkmResultAsync<void> {
  return fromSkmPromise(writeManifest(manifestPath, manifest));
}

export async function readLockfile(lockfilePath: string): Promise<SkillsLockfile> {
  if (!(await pathExists(lockfilePath))) {
    throw new SkmError(`Lockfile not found at ${lockfilePath}`, 2);
  }

  const raw = await readFile(lockfilePath, "utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new SkmError(`Invalid lockfile JSON at ${lockfilePath}: ${(error as Error).message}`, 2);
  }

  if (!isRecord(parsed) || !isRecord(parsed.skills)) {
    throw new SkmError(`Invalid lockfile shape at ${lockfilePath}`, 2);
  }

  const skills: Record<string, SkillLockEntry> = {};
  for (const [name, entry] of Object.entries(parsed.skills)) {
    skills[name] = parseLockEntry(lockfilePath, name, entry);
  }

  return { skills };
}

export async function writeLockfile(lockfilePath: string, lockfile: SkillsLockfile): Promise<void> {
  await ensureDir(path.dirname(lockfilePath));
  await writeFile(lockfilePath, `${JSON.stringify(lockfile, null, 2)}\n`);
}

export function readLockfileResult(lockfilePath: string): SkmResultAsync<SkillsLockfile> {
  return fromSkmPromise(readLockfile(lockfilePath));
}

export function writeLockfileResult(
  lockfilePath: string,
  lockfile: SkillsLockfile,
): SkmResultAsync<void> {
  return fromSkmPromise(writeLockfile(lockfilePath, lockfile));
}
