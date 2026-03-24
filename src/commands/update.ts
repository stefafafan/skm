import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { validateCanonicalName } from "#src/canonical-name.js";
import { SkmError } from "#src/errors.js";
import { removeIfExists } from "#src/fs.js";
import { hashDirectory } from "#src/hash.js";
import { materializeSkill } from "#src/materialize.js";
import { readLockfile, readManifest, writeLockfile } from "#src/manifest.js";
import { type CliResult, type CliSkillSummary } from "#src/output.js";
import { resolveScope } from "#src/scope.js";
import { defaultRequestedRef, fetchSkillToTempDir, isFixedRef, parseSource } from "#src/source.js";
import { storeSkill } from "#src/store.js";

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
  const names = options.canonicalName
    ? [validateCanonicalName(options.canonicalName)]
    : Object.keys(manifest.skills);
  if (options.canonicalName && !manifest.skills[options.canonicalName]) {
    throw new SkmError(`Skill ${options.canonicalName} not found in ${scope.kind} scope`, 1);
  }
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skm-update-"));
  const updatedSkills: CliSkillSummary[] = [];

  try {
    let updatedCount = 0;
    for (const name of names) {
      validateCanonicalName(name);
      const entry = manifest.skills[name];
      if (!entry) {
        continue;
      }
      const lockEntry = lockfile.skills[name];
      if (!lockEntry) {
        throw new SkmError(`Skill ${name} is missing lockfile state`, 2);
      }
      const parsedSource = parseSource(entry.source);
      const requestedRef = entry.requested ?? defaultRequestedRef(parsedSource);
      const requestedRefExplicit =
        parsedSource.kind === "github-tree" &&
        entry.requested !== undefined &&
        entry.requested !== parsedSource.ref;
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
          source: parsedSource,
          requestedRef,
          requestedRefExplicit,
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
