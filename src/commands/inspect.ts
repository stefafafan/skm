import path from "node:path";

import { SkmError } from "../errors";
import { mergeSkillState, readLockfile, readManifest } from "../manifest";
import { findProjectRoot, projectScope, resolveScope } from "../scope";

export async function runInspectCommand(options: {
  cwd: string;
  homeDir?: string;
  xdgConfigHome?: string;
  scope?: "global" | "project";
  canonicalName: string;
}): Promise<string> {
  const scope = await resolveScope({
    cwd: options.cwd,
    homeDir: options.homeDir,
    xdgConfigHome: options.xdgConfigHome,
    explicitScope: options.scope,
  });
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

  return [
    `canonical local name: ${options.canonicalName}`,
    `scope: ${scope.kind}`,
    `source: ${entry.source}`,
    `requested ref: ${entry.requested ?? ""}`,
    `resolved commit: ${entry.resolved}`,
    `integrity hash: ${entry.integrity ?? ""}`,
    `materialized path: ${path.join(scope.generatedSkillsDir, options.canonicalName)}`,
    `strategy: ${entry.strategy ?? "wrap"}`,
    `overridden by project skill: ${overriddenByProjectSkill}`,
    "",
  ].join("\n");
}
