import { type ResolvedSkillEntry, type SkillsLockfile, type SkillsManifest } from "./types.js";

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
