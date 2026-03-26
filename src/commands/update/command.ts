import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { type UpdateOptions, resolveCliScope } from "../../cli/global-options.js";
import { buildHelpResult, buildVersionResult } from "../../cli/help.js";
import { readLockfile, readManifest, writeLockfile } from "../../manifest/io.js";
import { materializeSkill } from "../../materialization/materialize-skill.js";
import { type CliResult, type CliSkillSummary } from "../../output/cli-result.js";
import { removeIfExists } from "../../platform/fs.js";
import { hashDirectory } from "../../platform/hash.js";
import { resolveScope } from "../../scope/resolve-scope.js";
import { defaultRequestedRef, isFixedRef } from "../../sources/checkout.js";
import { fetchSkillToTempDir } from "../../sources/fetch-skill.js";
import { parseSource } from "../../sources/parse.js";
import { validateCanonicalName } from "../../shared/canonical-name.js";
import { SkmError } from "../../shared/errors.js";
import { storeSkill } from "../../storage/store-skill.js";

export async function runUpdateCommand(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  name?: string;
  options: UpdateOptions;
}): Promise<CliResult> {
  const { cwd, env, name, options } = input;
  if (options.version) {
    return buildVersionResult();
  }
  if (options.help) {
    return buildHelpResult("update");
  }

  const scope = await resolveScope({
    cwd,
    homeDir: env.HOME,
    xdgConfigHome: env.XDG_CONFIG_HOME,
    explicitScope: resolveCliScope(options),
  });
  const manifest = await readManifest(scope.manifestPath);
  const lockfile = await readLockfile(scope.lockfilePath);
  const canonicalName = name ? validateCanonicalName(name) : undefined;
  const names = canonicalName ? [canonicalName] : Object.keys(manifest.skills);
  if (canonicalName && !manifest.skills[canonicalName]) {
    throw new SkmError(`Skill ${canonicalName} not found in ${scope.kind} scope`, 1);
  }
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skm-update-"));
  const updatedSkills: CliSkillSummary[] = [];

  try {
    let updatedCount = 0;
    for (const currentName of names) {
      validateCanonicalName(currentName);
      const entry = manifest.skills[currentName];
      if (!entry) {
        continue;
      }
      const lockEntry = lockfile.skills[currentName];
      if (!lockEntry) {
        throw new SkmError(`Skill ${currentName} is missing lockfile state`, 2);
      }
      const parsedSource = parseSource(entry.source);
      const requestedRef = entry.requested ?? defaultRequestedRef(parsedSource);
      const requestedRefExplicit =
        parsedSource.kind === "github-tree" &&
        entry.requested !== undefined &&
        entry.requested !== parsedSource.ref;
      if (isFixedRef(requestedRef) && !options.force) {
        updatedSkills.push({
          name: currentName,
          status: "skipped",
          source: entry.source,
          requested: requestedRef,
          resolved: lockEntry.resolved,
          integrity: lockEntry.integrity,
        });
        continue;
      }
      const fetched = await fetchSkillToTempDir(
        {
          source: parsedSource,
          requestedRef,
          requestedRefExplicit,
          githubBaseUrl: env.SKM_GITHUB_BASE_URL,
        },
        tempRoot,
      );
      const integrity = await hashDirectory(fetched.skillDir);
      const storeDir = await storeSkill(scope.storeDir, fetched.skillDir, integrity);
      lockEntry.resolved = fetched.resolved;
      lockEntry.integrity = integrity;
      await materializeSkill({
        canonicalName: currentName,
        sourceDir: storeDir,
        generatedSkillsDir: scope.generatedSkillsDir,
        manifestSource: entry.source,
        resolved: lockEntry.resolved,
        strategy: entry.strategy ?? "wrap",
      });
      updatedSkills.push({
        name: currentName,
        status: "updated",
        source: entry.source,
        requested: fetched.requestedRef,
        resolved: lockEntry.resolved,
        integrity,
      });
      updatedCount += 1;
    }
    await writeLockfile(scope.lockfilePath, lockfile);
    return {
      kind: "summary",
      command: "update",
      scope: scope.kind,
      summary: `Updated ${updatedCount} skill(s) in ${scope.kind} scope`,
      skills: updatedSkills,
    };
  } finally {
    await removeIfExists(tempRoot);
  }
}
