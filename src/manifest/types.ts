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
