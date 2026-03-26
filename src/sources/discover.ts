import { readdir } from "node:fs/promises";
import path from "node:path";

import { validateCanonicalName } from "../shared/canonical-name.js";
import { SkmError } from "../shared/errors.js";
import type { DiscoveredSkill } from "./types.js";

export async function discoverSkillsInRepo(repoDir: string): Promise<DiscoveredSkill[]> {
  const discovered = new Map<string, DiscoveredSkill>();
  await walk(repoDir);
  return [...discovered.values()].sort((left, right) =>
    left.relativeDir.localeCompare(right.relativeDir),
  );

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    const skillMdEntry = entries.find((entry) => entry.name === "SKILL.md");
    if (skillMdEntry?.isSymbolicLink()) {
      throw new SkmError(`Discovered skill at ${currentDir} SKILL.md cannot be a symlink`, 4);
    }
    const hasSkill = skillMdEntry?.isFile() ?? false;
    if (hasSkill) {
      const relativeDir = path.relative(repoDir, currentDir) || ".";
      const canonicalName = validateCanonicalName(path.basename(currentDir));
      discovered.set(relativeDir, {
        relativeDir,
        canonicalName,
        absoluteDir: currentDir,
      });
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      await walk(path.join(currentDir, entry.name));
    }
  }
}
