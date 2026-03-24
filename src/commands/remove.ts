import { resolveCanonicalSkillPath, validateCanonicalName } from "#src/canonical-name.js";
import { SkmError } from "#src/errors.js";
import { removeIfExists } from "#src/fs.js";
import { readLockfile, readManifest, writeLockfile, writeManifest } from "#src/manifest.js";
import { type CliResult } from "#src/output.js";
import { resolveScope } from "#src/scope.js";

export async function runRemoveCommand(options: {
  cwd: string;
  homeDir?: string;
  xdgConfigHome?: string;
  scope?: "global" | "project";
  canonicalName: string;
}): Promise<CliResult> {
  const scope = await resolveScope({
    cwd: options.cwd,
    homeDir: options.homeDir,
    xdgConfigHome: options.xdgConfigHome,
    explicitScope: options.scope,
  });
  const manifest = await readManifest(scope.manifestPath);
  const lockfile = await readLockfile(scope.lockfilePath);
  validateCanonicalName(options.canonicalName);
  if (!(options.canonicalName in manifest.skills)) {
    throw new SkmError(`Skill ${options.canonicalName} not found in ${scope.kind} scope`, 1);
  }
  delete manifest.skills[options.canonicalName];
  delete lockfile.skills[options.canonicalName];
  await writeManifest(scope.manifestPath, manifest);
  await writeLockfile(scope.lockfilePath, lockfile);
  await removeIfExists(resolveCanonicalSkillPath(scope.generatedSkillsDir, options.canonicalName));
  return {
    kind: "summary",
    command: "remove",
    scope: scope.kind,
    summary: `Removed ${options.canonicalName} from ${scope.kind} scope`,
    skills: [{ name: options.canonicalName, status: "removed" }],
  };
}
