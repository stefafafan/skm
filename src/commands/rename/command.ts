import { type ScopeOptions, resolveCliScope } from "../../cli/global-options.js";
import { buildHelpResult, buildVersionResult } from "../../cli/help.js";
import { readLockfile, readManifest, writeLockfile, writeManifest } from "../../manifest/io.js";
import { materializeSkill } from "../../materialization/materialize-skill.js";
import { type CliResult } from "../../output/cli-result.js";
import { removeIfExists } from "../../platform/fs.js";
import { resolveScope } from "../../scope/resolve-scope.js";
import { resolveCanonicalSkillPath, validateCanonicalName } from "../../shared/canonical-name.js";
import { SkmError } from "../../shared/errors.js";
import { storePath } from "../../storage/store-skill.js";

export async function runRenameCommand(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  oldName?: string;
  newName?: string;
  options: ScopeOptions;
}): Promise<CliResult> {
  const { cwd, env, oldName, newName, options } = input;
  if (options.version) {
    return buildVersionResult();
  }
  if (options.help) {
    return buildHelpResult("rename");
  }
  if (!oldName || !newName) {
    throw new SkmError("Usage: skm rename <old-name> <new-name>", 2);
  }

  const validatedOldName = validateCanonicalName(oldName);
  const validatedNewName = validateCanonicalName(newName);
  const scope = await resolveScope({
    cwd,
    homeDir: env.HOME,
    xdgConfigHome: env.XDG_CONFIG_HOME,
    explicitScope: resolveCliScope(options),
  });
  const manifest = await readManifest(scope.manifestPath);
  const lockfile = await readLockfile(scope.lockfilePath);
  const manifestEntry = manifest.skills[validatedOldName];
  const lockEntry = lockfile.skills[validatedOldName];
  if (!manifestEntry) {
    throw new SkmError(`Skill ${validatedOldName} not found in ${scope.kind} scope`, 1);
  }
  if (manifest.skills[validatedNewName]) {
    throw new SkmError(`Skill ${validatedNewName} already exists in ${scope.kind} scope`, 5);
  }
  if (!lockEntry) {
    throw new SkmError(`Skill ${validatedOldName} is missing lockfile state`, 2);
  }
  const sourceDir = storePath(scope.storeDir, lockEntry.integrity);

  delete manifest.skills[validatedOldName];
  manifest.skills[validatedNewName] = manifestEntry;
  delete lockfile.skills[validatedOldName];
  lockfile.skills[validatedNewName] = lockEntry;
  await writeManifest(scope.manifestPath, manifest);
  await writeLockfile(scope.lockfilePath, lockfile);

  await materializeSkill({
    canonicalName: validatedNewName,
    sourceDir,
    generatedSkillsDir: scope.generatedSkillsDir,
    manifestSource: manifestEntry.source,
    resolved: lockEntry.resolved,
    strategy: manifestEntry.strategy ?? "wrap",
  });
  await removeIfExists(resolveCanonicalSkillPath(scope.generatedSkillsDir, validatedOldName));

  return {
    kind: "summary",
    command: "rename",
    scope: scope.kind,
    summary: `Renamed ${validatedOldName} to ${validatedNewName} in ${scope.kind} scope`,
    skills: [
      {
        name: validatedNewName,
        previousName: validatedOldName,
        status: "renamed",
        source: manifestEntry.source,
        requested: manifestEntry.requested,
        resolved: lockEntry.resolved,
        integrity: lockEntry.integrity,
      },
    ],
  };
}
