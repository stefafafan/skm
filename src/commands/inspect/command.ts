import { type ScopeOptions, resolveCliScope } from "../../cli/global-options.js";
import { buildHelpResult, buildVersionResult } from "../../cli/help.js";
import { readLockfile, readManifest } from "../../manifest/io.js";
import { mergeSkillState } from "../../manifest/merge.js";
import { type CliResult } from "../../output/cli-result.js";
import { findProjectRoot, projectScope } from "../../scope/resolve-scope.js";
import { resolveScope } from "../../scope/resolve-scope.js";
import { resolveCanonicalSkillPath, validateCanonicalName } from "../../shared/canonical-name.js";
import { SkmError } from "../../shared/errors.js";

export async function runInspectCommand(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  name?: string;
  options: ScopeOptions;
}): Promise<CliResult> {
  const { cwd, env, name, options } = input;
  if (options.version) {
    return buildVersionResult();
  }
  if (options.help) {
    return buildHelpResult("inspect");
  }
  if (!name) {
    throw new SkmError("Usage: skm inspect <name>", 2);
  }

  const canonicalName = validateCanonicalName(name);
  const scope = await resolveScope({
    cwd,
    homeDir: env.HOME,
    xdgConfigHome: env.XDG_CONFIG_HOME,
    explicitScope: resolveCliScope(options),
  });
  const manifest = await readManifest(scope.manifestPath);
  const lockfile = await readLockfile(scope.lockfilePath);
  const entry = mergeSkillState(manifest, lockfile)[canonicalName];
  if (!entry) {
    throw new SkmError(`Skill ${canonicalName} not found in ${scope.kind} scope`, 1);
  }

  let overriddenByProjectSkill = "no";
  if (scope.kind === "global") {
    const projectRoot = await findProjectRoot(cwd);
    if (projectRoot) {
      try {
        const projectManifest = await readManifest(projectScope(projectRoot).manifestPath);
        if (projectManifest.skills[canonicalName]) {
          overriddenByProjectSkill = "yes";
        }
      } catch {
        overriddenByProjectSkill = "no";
      }
    }
  }

  return {
    kind: "inspect",
    name: canonicalName,
    scope: scope.kind,
    details: [
      { label: "canonical local name", value: canonicalName },
      { label: "scope", value: scope.kind },
      { label: "source", value: entry.source },
      { label: "requested ref", value: entry.requested ?? "" },
      { label: "resolved commit", value: entry.resolved ?? "" },
      { label: "integrity hash", value: entry.integrity ?? "" },
      {
        label: "materialized path",
        value: resolveCanonicalSkillPath(scope.generatedSkillsDir, canonicalName),
      },
      { label: "strategy", value: entry.strategy ?? "wrap" },
      { label: "overridden by project skill", value: overriddenByProjectSkill },
    ],
  };
}
