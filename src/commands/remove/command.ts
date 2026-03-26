import { type ScopeOptions, resolveCliScope } from "../../cli/global-options.js";
import { buildHelpResult, buildVersionResult } from "../../cli/help.js";
import { readLockfile, readManifest, writeLockfile, writeManifest } from "../../manifest/io.js";
import { type CliResult } from "../../output/cli-result.js";
import { removeIfExists } from "../../platform/fs.js";
import { resolveScope } from "../../scope/resolve-scope.js";
import { resolveCanonicalSkillPath, validateCanonicalName } from "../../shared/canonical-name.js";
import { SkmError } from "../../shared/errors.js";

export async function runRemoveCommand(input: {
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
    return buildHelpResult("remove");
  }
  if (!name) {
    throw new SkmError("Usage: skm remove <name>", 2);
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
  if (!(canonicalName in manifest.skills)) {
    throw new SkmError(`Skill ${canonicalName} not found in ${scope.kind} scope`, 1);
  }
  delete manifest.skills[canonicalName];
  delete lockfile.skills[canonicalName];
  await writeManifest(scope.manifestPath, manifest);
  await writeLockfile(scope.lockfilePath, lockfile);
  await removeIfExists(resolveCanonicalSkillPath(scope.generatedSkillsDir, canonicalName));
  return {
    kind: "summary",
    command: "remove",
    scope: scope.kind,
    summary: `Removed ${canonicalName} from ${scope.kind} scope`,
    skills: [{ name: canonicalName, status: "removed" }],
  };
}
