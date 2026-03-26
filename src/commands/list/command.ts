import { type ListOptions, resolveCliScope } from "../../cli/global-options.js";
import { buildHelpResult, buildVersionResult } from "../../cli/help.js";
import { readLockfile, readManifest } from "../../manifest/io.js";
import { mergeSkillState } from "../../manifest/merge.js";
import { type ResolvedSkillEntry } from "../../manifest/types.js";
import { type CliResult, type CliListRow } from "../../output/cli-result.js";
import { findProjectRoot, globalScope, projectScope } from "../../scope/resolve-scope.js";
import { resolveScope } from "../../scope/resolve-scope.js";

type ListedSkill = {
  name: string;
  scope: "global" | "project";
  entry: ResolvedSkillEntry;
};

export async function runListCommand(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  options: ListOptions;
}): Promise<CliResult> {
  const { cwd, env, options } = input;
  if (options.version) {
    return buildVersionResult();
  }
  if (options.help) {
    return buildHelpResult("list");
  }

  const listedSkills = await collectSkills({
    cwd,
    homeDir: env.HOME,
    xdgConfigHome: env.XDG_CONFIG_HOME,
    scope: resolveCliScope(options),
    all: Boolean(options.all),
  });
  const projectNames = new Set(
    listedSkills.filter((skill) => skill.scope === "project").map((skill) => skill.name),
  );
  const rows: CliListRow[] = listedSkills.map((skill) => ({
    name: skill.name,
    scope: skill.scope,
    source: skill.entry.source,
    requested: skill.entry.requested,
    resolved: skill.entry.resolved,
    effective: skill.scope === "global" && projectNames.has(skill.name) ? "overridden" : "active",
  }));

  return {
    kind: "list",
    all: Boolean(options.all),
    rows,
  };
}

async function collectSkills(options: {
  cwd: string;
  homeDir?: string;
  xdgConfigHome?: string;
  scope?: "global" | "project";
  all: boolean;
}): Promise<ListedSkill[]> {
  if (!options.all) {
    const scope = await resolveScope({
      cwd: options.cwd,
      homeDir: options.homeDir,
      xdgConfigHome: options.xdgConfigHome,
      explicitScope: options.scope,
    });
    const manifest = await readManifest(scope.manifestPath);
    const lockfile = await readLockfile(scope.lockfilePath);
    return Object.entries(mergeSkillState(manifest, lockfile)).map(([name, entry]) => ({
      name,
      scope: scope.kind,
      entry,
    }));
  }

  const projectRoot = await findProjectRoot(options.cwd);
  const manifests: Array<{
    scope: "global" | "project";
    manifestPath: string;
    lockfilePath: string;
  }> = [];
  if (options.homeDir) {
    const global = globalScope(options.homeDir, options.xdgConfigHome);
    manifests.push({
      scope: "global",
      manifestPath: global.manifestPath,
      lockfilePath: global.lockfilePath,
    });
  }
  if (projectRoot) {
    const project = projectScope(projectRoot);
    manifests.push({
      scope: "project",
      manifestPath: project.manifestPath,
      lockfilePath: project.lockfilePath,
    });
  }

  const rows: ListedSkill[] = [];
  for (const manifestTarget of manifests) {
    try {
      const manifest = await readManifest(manifestTarget.manifestPath);
      const lockfile = await readLockfile(manifestTarget.lockfilePath);
      for (const [name, entry] of Object.entries(mergeSkillState(manifest, lockfile))) {
        rows.push({ name, scope: manifestTarget.scope, entry });
      }
    } catch {
      continue;
    }
  }

  return rows.sort(
    (left, right) => left.name.localeCompare(right.name) || left.scope.localeCompare(right.scope),
  );
}
