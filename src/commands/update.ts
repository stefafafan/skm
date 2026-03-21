import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SkmError } from "../errors";
import { removeIfExists } from "../fs";
import { hashDirectory } from "../hash";
import { materializeSkill } from "../materialize";
import { readLockfile, readManifest, writeLockfile } from "../manifest";
import { type CliResult, type CliSkillSummary } from "../output";
import { resolveScope } from "../scope";
import { defaultRequestedRef, fetchSkillToTempDir, isFixedRef, parseSource } from "../source";
import { storeSkill } from "../store";

export async function runUpdateCommand(options: {
  cwd: string;
  homeDir?: string;
  xdgConfigHome?: string;
  scope?: "global" | "project";
  canonicalName?: string;
  force: boolean;
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
  const names = options.canonicalName ? [options.canonicalName] : Object.keys(manifest.skills);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skm-update-"));
  const updatedSkills: CliSkillSummary[] = [];

  try {
    let updatedCount = 0;
    for (const name of names) {
      const entry = manifest.skills[name];
      if (!entry) {
        continue;
      }
      const lockEntry = lockfile.skills[name];
      if (!lockEntry) {
        throw new SkmError(`Skill ${name} is missing lockfile state`, 2);
      }
      const requestedRef = entry.requested ?? defaultRequestedRef(parseSource(entry.source));
      if (isFixedRef(requestedRef) && !options.force) {
        updatedSkills.push({
          name,
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
          source: parseSource(entry.source),
          requestedRef,
          githubBaseUrl: options.githubBaseUrl,
        },
        tempRoot,
      );
      const integrity = await hashDirectory(fetched.skillDir);
      const storeDir = await storeSkill(scope.storeDir, fetched.skillDir, integrity);
      lockEntry.resolved = fetched.resolved;
      lockEntry.integrity = integrity;
      await materializeSkill({
        canonicalName: name,
        sourceDir: storeDir,
        generatedSkillsDir: scope.generatedSkillsDir,
        manifestSource: entry.source,
        resolved: lockEntry.resolved,
        strategy: entry.strategy ?? "wrap",
      });
      updatedSkills.push({
        name,
        status: "updated",
        source: entry.source,
        requested: requestedRef,
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
