import { resolveCanonicalSkillPath, validateCanonicalName } from "../canonical-name";
import { SkmError } from "../errors";
import { materializeSkill } from "../materialize";
import { readLockfile, readManifest, writeLockfile, writeManifest } from "../manifest";
import { type CliResult } from "../output";
import { resolveScope } from "../scope";
import { storePath } from "../store";
import { removeIfExists } from "../fs";

export async function runRenameCommand(options: {
  cwd: string;
  homeDir?: string;
  xdgConfigHome?: string;
  scope?: "global" | "project";
  oldName: string;
  newName: string;
}): Promise<CliResult> {
  const scope = await resolveScope({
    cwd: options.cwd,
    homeDir: options.homeDir,
    xdgConfigHome: options.xdgConfigHome,
    explicitScope: options.scope,
  });
  const manifest = await readManifest(scope.manifestPath);
  const lockfile = await readLockfile(scope.lockfilePath);
  validateCanonicalName(options.oldName);
  validateCanonicalName(options.newName);
  const manifestEntry = manifest.skills[options.oldName];
  const lockEntry = lockfile.skills[options.oldName];
  if (!manifestEntry) {
    throw new SkmError(`Skill ${options.oldName} not found in ${scope.kind} scope`, 1);
  }
  if (manifest.skills[options.newName]) {
    throw new SkmError(`Skill ${options.newName} already exists in ${scope.kind} scope`, 5);
  }
  if (!lockEntry) {
    throw new SkmError(`Skill ${options.oldName} is missing lockfile state`, 2);
  }
  const sourceDir = storePath(scope.storeDir, lockEntry.integrity);

  delete manifest.skills[options.oldName];
  manifest.skills[options.newName] = manifestEntry;
  delete lockfile.skills[options.oldName];
  lockfile.skills[options.newName] = lockEntry;
  await writeManifest(scope.manifestPath, manifest);
  await writeLockfile(scope.lockfilePath, lockfile);

  await materializeSkill({
    canonicalName: options.newName,
    sourceDir,
    generatedSkillsDir: scope.generatedSkillsDir,
    manifestSource: manifestEntry.source,
    resolved: lockEntry.resolved,
    strategy: manifestEntry.strategy ?? "wrap",
  });
  await removeIfExists(resolveCanonicalSkillPath(scope.generatedSkillsDir, options.oldName));

  return {
    kind: "summary",
    command: "rename",
    scope: scope.kind,
    summary: `Renamed ${options.oldName} to ${options.newName} in ${scope.kind} scope`,
    skills: [
      {
        name: options.newName,
        previousName: options.oldName,
        status: "renamed",
        source: manifestEntry.source,
        requested: manifestEntry.requested,
        resolved: lockEntry.resolved,
        integrity: lockEntry.integrity,
      },
    ],
  };
}
