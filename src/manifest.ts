import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { SkmError } from "./errors";
import { ensureDir, pathExists } from "./fs";

export type MaterializationStrategy = "wrap" | "link" | "copy";
export const DEFAULT_OUTPUT_DIR = ".agents/skills";

export interface SkillManifestEntry {
  source: string;
  requested?: string;
  strategy?: MaterializationStrategy;
}

export interface SkillsManifest {
  outputDir: string;
  skills: Record<string, SkillManifestEntry>;
}

export interface SkillLockEntry {
  resolved: string;
  integrity: string;
}

export interface SkillsLockfile {
  skills: Record<string, SkillLockEntry>;
}

export interface ResolvedSkillEntry extends SkillManifestEntry {
  resolved?: string;
  integrity?: string;
}

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

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("skills" in parsed) ||
    typeof (parsed as { skills?: unknown }).skills !== "object"
  ) {
    throw new SkmError(`Invalid manifest shape at ${manifestPath}`, 2);
  }

  const parsedObject = parsed as {
    outputDir?: unknown;
    skills: Record<string, SkillManifestEntry>;
  };
  const outputDir =
    typeof parsedObject.outputDir === "string" ? parsedObject.outputDir : DEFAULT_OUTPUT_DIR;

  return {
    outputDir,
    skills: parsedObject.skills,
  };
}

export async function writeManifest(manifestPath: string, manifest: SkillsManifest): Promise<void> {
  await ensureDir(path.dirname(manifestPath));
  await writeFile(
    manifestPath,
    `${JSON.stringify({ outputDir: manifest.outputDir, skills: manifest.skills }, null, 2)}\n`,
  );
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

  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("skills" in parsed) ||
    typeof (parsed as { skills?: unknown }).skills !== "object"
  ) {
    throw new SkmError(`Invalid lockfile shape at ${lockfilePath}`, 2);
  }

  return parsed as SkillsLockfile;
}

export async function writeLockfile(lockfilePath: string, lockfile: SkillsLockfile): Promise<void> {
  await ensureDir(path.dirname(lockfilePath));
  await writeFile(lockfilePath, `${JSON.stringify(lockfile, null, 2)}\n`);
}

export function mergeSkillState(
  manifest: SkillsManifest,
  lockfile: SkillsLockfile,
): Record<string, ResolvedSkillEntry> {
  const merged: Record<string, ResolvedSkillEntry> = {};
  for (const [name, entry] of Object.entries(manifest.skills)) {
    merged[name] = {
      ...entry,
      resolved: lockfile.skills[name]?.resolved,
      integrity: lockfile.skills[name]?.integrity,
    };
  }
  return merged;
}
