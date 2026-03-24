import { resolveCanonicalSkillPath, validateCanonicalName } from "../canonical-name.js";
import { SkmError } from "../errors.js";
import { mergeSkillState, readLockfile, readManifest } from "../manifest.js";
import { type CliInspectResult } from "../output.js";
import { findProjectRoot, projectScope, resolveScope } from "../scope.js";

export async function runInspectCommand(options: {
  cwd: string;
  homeDir?: string;
  xdgConfigHome?: string;
  scope?: "global" | "project";
  canonicalName: string;
}): Promise<CliInspectResult> {
  const scope = await resolveScope({
    cwd: options.cwd,
    homeDir: options.homeDir,
    xdgConfigHome: options.xdgConfigHome,
    explicitScope: options.scope,
  });
  validateCanonicalName(options.canonicalName);
  const manifest = await readManifest(scope.manifestPath);
  const lockfile = await readLockfile(scope.lockfilePath);
  const entry = mergeSkillState(manifest, lockfile)[options.canonicalName];
  if (!entry) {
    throw new SkmError(`Skill ${options.canonicalName} not found in ${scope.kind} scope`, 1);
  }

  let overriddenByProjectSkill = "no";
  if (scope.kind === "global") {
    const projectRoot = await findProjectRoot(options.cwd);
    if (projectRoot) {
      try {
        const projectManifest = await readManifest(projectScope(projectRoot).manifestPath);
        if (projectManifest.skills[options.canonicalName]) {
          overriddenByProjectSkill = "yes";
        }
      } catch {
        overriddenByProjectSkill = "no";
      }
    }
  }

  return {
    kind: "inspect",
    name: options.canonicalName,
    scope: scope.kind,
    details: [
      { label: "canonical local name", value: options.canonicalName },
      { label: "scope", value: scope.kind },
      { label: "source", value: entry.source },
      { label: "requested ref", value: entry.requested ?? "" },
      { label: "resolved commit", value: entry.resolved ?? "" },
      { label: "integrity hash", value: entry.integrity ?? "" },
      {
        label: "materialized path",
        value: resolveCanonicalSkillPath(scope.generatedSkillsDir, options.canonicalName),
      },
      { label: "strategy", value: entry.strategy ?? "wrap" },
      { label: "overridden by project skill", value: overriddenByProjectSkill },
    ],
  };
}
