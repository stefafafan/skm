import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { validateCanonicalName } from "#src/canonical-name.js";
import { SkmError } from "#src/errors.js";
import { hashDirectory } from "#src/hash.js";
import { readLockfile, readManifest, writeLockfile, writeManifest } from "#src/manifest.js";
import { type CliResult, type CliSkillSummary } from "#src/output.js";
import { resolveScope } from "#src/scope.js";
import {
  canonicalTreeUrl,
  checkoutSourceRepo,
  defaultRequestedRef,
  discoverSkillsInRepo,
  fetchSkillToTempDir,
  parseSource,
} from "#src/source.js";
import { storeSkill } from "#src/store.js";
import { materializeSkill } from "#src/materialize.js";
import { removeIfExists } from "#src/fs.js";

export async function runAddCommand(options: {
  cwd: string;
  homeDir?: string;
  xdgConfigHome?: string;
  scope?: "global" | "project";
  source: string;
  canonicalName?: string;
  requestedRef?: string;
  strategy?: "wrap" | "link" | "copy";
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
  const parsedSource = parseSource(options.source);
  const requestedRef = options.requestedRef ?? defaultRequestedRef(parsedSource);
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skm-add-"));

  try {
    if (parsedSource.kind === "github-repo") {
      if (options.canonicalName) {
        throw new SkmError("--as is not supported for repo-wide imports", 2);
      }

      const checkedOut = await checkoutSourceRepo(
        {
          source: parsedSource,
          requestedRef,
          requestedRefExplicit: options.requestedRef !== undefined,
          githubBaseUrl: options.githubBaseUrl,
        },
        tempRoot,
      );
      const discoveredSkills = await discoverSkillsInRepo(checkedOut.checkoutDir);
      if (discoveredSkills.length === 0) {
        throw new SkmError(`No skills found in repository ${options.source}`, 4);
      }

      const seenCanonicalNames = new Set<string>();
      for (const discoveredSkill of discoveredSkills) {
        const canonicalName = validateCanonicalName(discoveredSkill.canonicalName);
        if (seenCanonicalNames.has(canonicalName)) {
          throw new SkmError(`Duplicate canonical name discovered: ${canonicalName}`, 5);
        }
        seenCanonicalNames.add(canonicalName);
      }

      const strategy = options.strategy ?? "wrap";
      const addedSkills: CliSkillSummary[] = [];
      for (const discoveredSkill of discoveredSkills) {
        const canonicalName = validateCanonicalName(discoveredSkill.canonicalName);
        const integrity = await hashDirectory(discoveredSkill.absoluteDir);
        const storeDir = await storeSkill(scope.storeDir, discoveredSkill.absoluteDir, integrity);
        const canonicalSource = canonicalTreeUrl(
          parsedSource,
          requestedRef,
          discoveredSkill.relativeDir,
        );
        manifest.skills[canonicalName] = {
          source: canonicalSource,
          requested: requestedRef,
          strategy,
        };
        lockfile.skills[canonicalName] = {
          resolved: checkedOut.resolved,
          integrity,
        };
        await materializeSkill({
          canonicalName,
          sourceDir: storeDir,
          generatedSkillsDir: scope.generatedSkillsDir,
          manifestSource: options.source,
          resolved: checkedOut.resolved,
          strategy,
        });
        addedSkills.push({
          name: canonicalName,
          status: "added",
          source: canonicalSource,
          requested: requestedRef,
          resolved: checkedOut.resolved,
        });
      }

      await writeManifest(scope.manifestPath, manifest);
      await writeLockfile(scope.lockfilePath, lockfile);
      return {
        kind: "summary",
        command: "add",
        scope: scope.kind,
        summary: `Added ${discoveredSkills.length} skill(s) to ${scope.kind} scope`,
        details: [
          { label: "source", value: options.source },
          { label: "requested", value: requestedRef },
        ],
        skills: addedSkills,
      };
    }

    const fetched = await fetchSkillToTempDir(
      {
        source: parsedSource,
        requestedRef,
        requestedRefExplicit: options.requestedRef !== undefined,
        githubBaseUrl: options.githubBaseUrl,
      },
      tempRoot,
    );
    const integrity = await hashDirectory(fetched.skillDir);
    const storeDir = await storeSkill(scope.storeDir, fetched.skillDir, integrity);
    const canonicalName = validateCanonicalName(options.canonicalName ?? parsedSource.defaultName);
    const strategy = options.strategy ?? "wrap";
    manifest.skills[canonicalName] = {
      source: options.source,
      requested: fetched.requestedRef,
      strategy,
    };
    lockfile.skills[canonicalName] = {
      resolved: fetched.resolved,
      integrity,
    };
    await writeManifest(scope.manifestPath, manifest);
    await writeLockfile(scope.lockfilePath, lockfile);
    await materializeSkill({
      canonicalName,
      sourceDir: storeDir,
      generatedSkillsDir: scope.generatedSkillsDir,
      manifestSource: options.source,
      resolved: fetched.resolved,
      strategy,
    });
    return {
      kind: "summary",
      command: "add",
      scope: scope.kind,
      summary: `Added ${canonicalName} to ${scope.kind} scope`,
      details: [
        { label: "source", value: options.source },
        { label: "requested", value: fetched.requestedRef },
        { label: "strategy", value: strategy },
      ],
      skills: [
        {
          name: canonicalName,
          status: "added",
          source: options.source,
          requested: fetched.requestedRef,
          resolved: fetched.resolved,
          integrity,
        },
      ],
    };
  } finally {
    await removeIfExists(tempRoot);
  }
}
