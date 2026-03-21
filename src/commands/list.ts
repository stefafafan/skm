import { mergeSkillState, readLockfile, readManifest, ResolvedSkillEntry } from "../manifest";
import { type CliListResult, type CliListRow } from "../output";
import { findProjectRoot, globalScope, projectScope, resolveScope } from "../scope";

interface ListedSkill {
  name: string;
  scope: "global" | "project";
  entry: ResolvedSkillEntry;
}

export async function runListCommand(options: {
  cwd: string;
  homeDir?: string;
  xdgConfigHome?: string;
  scope?: "global" | "project";
  all: boolean;
}): Promise<CliListResult> {
  const listedSkills = await collectSkills(options);
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
    all: options.all,
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

  const homeDir = options.homeDir ?? process.env.HOME;
  const projectRoot = await findProjectRoot(options.cwd);
  const manifests: Array<{
    scope: "global" | "project";
    manifestPath: string;
    lockfilePath: string;
  }> = [];
  if (homeDir) {
    const global = globalScope(homeDir, options.xdgConfigHome);
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
