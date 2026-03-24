import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { SkmError } from "./errors";
import { ensureDir, pathExists } from "./fs";

export type MaterializationStrategy = "wrap" | "link" | "copy";
export const DEFAULT_OUTPUT_DIR = ".agents/skills";

export type SkillManifestEntry = {
  source: string;
  requested?: string;
  strategy?: MaterializationStrategy;
};

export type SkillsManifest = {
  outputDir: string;
  skills: Record<string, SkillManifestEntry>;
};

export type SkillLockEntry = {
  resolved: string;
  integrity: string;
};

export type SkillsLockfile = {
  skills: Record<string, SkillLockEntry>;
};

export type ResolvedSkillEntry = SkillManifestEntry & {
  resolved?: string;
  integrity?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMaterializationStrategy(value: unknown): value is MaterializationStrategy {
  return value === "wrap" || value === "link" || value === "copy";
}

function parseManifestEntry(
  manifestPath: string,
  skillName: string,
  value: unknown,
): SkillManifestEntry {
  if (!isRecord(value)) {
    throw new SkmError(`Invalid manifest shape at ${manifestPath}: skill "${skillName}" must be an object`, 2);
  }
  if (typeof value.source !== "string") {
    throw new SkmError(
      `Invalid manifest shape at ${manifestPath}: skill "${skillName}" source must be a string`,
      2,
    );
  }
  if (value.requested !== undefined && typeof value.requested !== "string") {
    throw new SkmError(
      `Invalid manifest shape at ${manifestPath}: skill "${skillName}" requested must be a string`,
      2,
    );
  }
  if (value.strategy !== undefined && !isMaterializationStrategy(value.strategy)) {
    throw new SkmError(
      `Invalid manifest shape at ${manifestPath}: skill "${skillName}" strategy must be one of wrap, link, or copy`,
      2,
    );
  }

  return {
    source: value.source,
    requested: value.requested,
    strategy: value.strategy,
  };
}

function parseLockEntry(lockfilePath: string, skillName: string, value: unknown): SkillLockEntry {
  if (!isRecord(value)) {
    throw new SkmError(`Invalid lockfile shape at ${lockfilePath}: skill "${skillName}" must be an object`, 2);
  }
  if (typeof value.resolved !== "string") {
    throw new SkmError(
      `Invalid lockfile shape at ${lockfilePath}: skill "${skillName}" resolved must be a string`,
      2,
    );
  }
  if (typeof value.integrity !== "string") {
    throw new SkmError(
      `Invalid lockfile shape at ${lockfilePath}: skill "${skillName}" integrity must be a string`,
      2,
    );
  }

  return {
    resolved: value.resolved,
    integrity: value.integrity,
  };
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
