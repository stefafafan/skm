import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { resolveCanonicalSkillPath, validateCanonicalName } from "../canonical-name";
import { SkmError } from "../errors";
import { pathExists, removeIfExists } from "../fs";
import { hashDirectory } from "../hash";
import { materializeSkill } from "../materialize";
import { readLockfile, readManifest, writeLockfile } from "../manifest";
import { type CliResult, type CliSkillSummary } from "../output";
import { resolveScope } from "../scope";
import { defaultRequestedRef, fetchSkillToTempDir, parseSource } from "../source";
import { storePath, storeSkill } from "../store";

export async function runInstallCommand(options: {
  cwd: string;
  homeDir?: string;
  xdgConfigHome?: string;
  scope?: "global" | "project";
  githubBaseUrl?: string;
}): Promise<CliResult> {
  const scope = await resolveScope({
    cwd: options.cwd,
    homeDir: options.homeDir,
    xdgConfigHome: options.xdgConfigHome,
    explicitScope: options.scope,
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
      if (!lockEntry) {
        const fetched = await fetchSkillToTempDir(
          {
            source: parsedSource,
            requestedRef,
            githubBaseUrl: options.githubBaseUrl,
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
          requested: requestedRef,
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
            requestedRef: lockEntry.resolved,
            githubBaseUrl: options.githubBaseUrl,
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
