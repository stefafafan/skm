import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { type ScopeOptions, resolveCliScope } from "../../cli/global-options.js";
import { buildHelpResult, buildVersionResult } from "../../cli/help.js";
import { readLockfile, readManifest, writeLockfile } from "../../manifest/io.js";
import { materializeSkill } from "../../materialization/materialize-skill.js";
import { type CliResult, type CliSkillSummary } from "../../output/cli-result.js";
import { pathExists, removeIfExists } from "../../platform/fs.js";
import { hashDirectory } from "../../platform/hash.js";
import { resolveScope } from "../../scope/resolve-scope.js";
import { defaultRequestedRef } from "../../sources/checkout.js";
import { fetchSkillToTempDir } from "../../sources/fetch-skill.js";
import { parseSource } from "../../sources/parse.js";
import { resolveCanonicalSkillPath, validateCanonicalName } from "../../shared/canonical-name.js";
import { SkmError } from "../../shared/errors.js";
import { storePath, storeSkill } from "../../storage/store-skill.js";

export async function runInstallCommand(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  options: ScopeOptions;
}): Promise<CliResult> {
  const { cwd, env, options } = input;
  if (options.version) {
    return buildVersionResult();
  }
  if (options.help) {
    return buildHelpResult("install");
  }

  const scope = await resolveScope({
    cwd,
    homeDir: env.HOME,
    xdgConfigHome: env.XDG_CONFIG_HOME,
    explicitScope: resolveCliScope(options),
  });
  const manifest = await readManifest(scope.manifestPath);
  const lockfile = await readLockfile(scope.lockfilePath);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skm-install-"));
  const reconciledSkills: CliSkillSummary[] = [];

  try {
    for (const name of Object.keys(lockfile.skills)) {
      validateCanonicalName(name);
      if (!(name in manifest.skills)) {
        delete lockfile.skills[name];
        await removeIfExists(resolveCanonicalSkillPath(scope.generatedSkillsDir, name));
      }
    }

    for (const [canonicalName, entry] of Object.entries(manifest.skills)) {
      validateCanonicalName(canonicalName);
      let lockEntry = lockfile.skills[canonicalName];
      const parsedSource = parseSource(entry.source);
      const requestedRef = entry.requested ?? defaultRequestedRef(parsedSource);
      const requestedRefExplicit =
        parsedSource.kind === "github-tree" &&
        entry.requested !== undefined &&
        entry.requested !== parsedSource.ref;
      if (!lockEntry) {
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
        const storedPath = await storeSkill(scope.storeDir, fetched.skillDir, integrity);
        lockEntry = {
          resolved: fetched.resolved,
          integrity,
        };
        lockfile.skills[canonicalName] = lockEntry;
        await materializeSkill({
          canonicalName,
          sourceDir: storedPath,
          generatedSkillsDir: scope.generatedSkillsDir,
          manifestSource: entry.source,
          resolved: lockEntry.resolved,
          strategy: entry.strategy ?? "wrap",
        });
        reconciledSkills.push({
          name: canonicalName,
          status: "installed",
          source: entry.source,
          requested: fetched.requestedRef,
          resolved: lockEntry.resolved,
          integrity,
        });
        continue;
      }

      const integrity = lockEntry.integrity;
      let materialSource = storePath(scope.storeDir, integrity);
      if (!(await pathExists(materialSource))) {
        const fetched = await fetchSkillToTempDir(
          {
            source: parsedSource,
            requestedRef,
            requestedRefExplicit,
            checkoutRef: lockEntry.resolved,
            githubBaseUrl: env.SKM_GITHUB_BASE_URL,
          },
          tempRoot,
        );
        const actualIntegrity = await hashDirectory(fetched.skillDir);
        if (actualIntegrity !== integrity) {
          throw new SkmError(
            `Integrity mismatch for ${canonicalName}: expected ${integrity}, got ${actualIntegrity}`,
            4,
          );
        }
        materialSource = await storeSkill(scope.storeDir, fetched.skillDir, integrity);
      }
      await materializeSkill({
        canonicalName,
        sourceDir: materialSource,
        generatedSkillsDir: scope.generatedSkillsDir,
        manifestSource: entry.source,
        resolved: lockEntry.resolved,
        strategy: entry.strategy ?? "wrap",
      });
      reconciledSkills.push({
        name: canonicalName,
        status: "installed",
        source: entry.source,
        requested: requestedRef,
        resolved: lockEntry.resolved,
        integrity,
      });
    }

    await writeLockfile(scope.lockfilePath, lockfile);
    return {
      kind: "summary",
      command: "install",
      scope: scope.kind,
      summary: `Installed ${Object.keys(manifest.skills).length} skill(s) for ${scope.kind} scope`,
      skills: reconciledSkills,
    };
  } finally {
    await removeIfExists(tempRoot);
  }
}
