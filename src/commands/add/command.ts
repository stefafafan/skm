import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { type AddOptions, resolveCliScope } from "../../cli/global-options.js";
import { buildHelpResult, buildVersionResult } from "../../cli/help.js";
import { readLockfile, readManifest, writeLockfile, writeManifest } from "../../manifest/io.js";
import { materializeSkill } from "../../materialization/materialize-skill.js";
import { type CliResult, type CliSkillSummary } from "../../output/cli-result.js";
import { removeIfExists } from "../../platform/fs.js";
import { hashDirectory } from "../../platform/hash.js";
import { resolveScope } from "../../scope/resolve-scope.js";
import { validateCanonicalName } from "../../shared/canonical-name.js";
import { SkmError } from "../../shared/errors.js";
import { checkoutSourceRepo, defaultRequestedRef } from "../../sources/checkout.js";
import { discoverSkillsInRepo } from "../../sources/discover.js";
import { fetchSkillToTempDir } from "../../sources/fetch-skill.js";
import { canonicalTreeUrl } from "../../sources/github.js";
import { parseSource } from "../../sources/parse.js";
import { storeSkill } from "../../storage/store-skill.js";

export async function runAddCommand(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  source?: string;
  options: AddOptions;
}): Promise<CliResult> {
  const { cwd, env, options, source } = input;
  if (options.version) {
    return buildVersionResult();
  }
  if (options.help) {
    return buildHelpResult("add");
  }
  if (!source) {
    throw new SkmError("Usage: skm add <source>", 2);
  }

  const scope = await resolveScope({
    cwd,
    homeDir: env.HOME,
    xdgConfigHome: env.XDG_CONFIG_HOME,
    explicitScope: resolveCliScope(options),
  });
  const manifest = await readManifest(scope.manifestPath);
  const lockfile = await readLockfile(scope.lockfilePath);
  const parsedSource = parseSource(source);
  const requestedRef = options.ref ?? defaultRequestedRef(parsedSource);
  const canonicalName = options.as ? validateCanonicalName(options.as) : undefined;
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "skm-add-"));

  try {
    if (parsedSource.kind === "github-repo") {
      if (canonicalName) {
        throw new SkmError("--as is not supported for repo-wide imports", 2);
      }

      const checkedOut = await checkoutSourceRepo(
        {
          source: parsedSource,
          requestedRef,
          requestedRefExplicit: options.ref !== undefined,
          githubBaseUrl: env.SKM_GITHUB_BASE_URL,
        },
        tempRoot,
      );
      const discoveredSkills = await discoverSkillsInRepo(checkedOut.checkoutDir);
      if (discoveredSkills.length === 0) {
        throw new SkmError(`No skills found in repository ${source}`, 4);
      }

      const seenCanonicalNames = new Set<string>();
      for (const discoveredSkill of discoveredSkills) {
        const discoveredName = validateCanonicalName(discoveredSkill.canonicalName);
        if (seenCanonicalNames.has(discoveredName)) {
          throw new SkmError(`Duplicate canonical name discovered: ${discoveredName}`, 5);
        }
        seenCanonicalNames.add(discoveredName);
      }

      const strategy = "wrap";
      const addedSkills: CliSkillSummary[] = [];
      for (const discoveredSkill of discoveredSkills) {
        const discoveredName = validateCanonicalName(discoveredSkill.canonicalName);
        const integrity = await hashDirectory(discoveredSkill.absoluteDir);
        const storeDir = await storeSkill(scope.storeDir, discoveredSkill.absoluteDir, integrity);
        const canonicalSource = canonicalTreeUrl(
          parsedSource,
          checkedOut.requestedRef,
          discoveredSkill.relativeDir,
        );
        manifest.skills[discoveredName] = {
          source: canonicalSource,
          requested: checkedOut.requestedRef,
          strategy,
        };
        lockfile.skills[discoveredName] = {
          resolved: checkedOut.resolved,
          integrity,
        };
        await materializeSkill({
          canonicalName: discoveredName,
          sourceDir: storeDir,
          generatedSkillsDir: scope.generatedSkillsDir,
          manifestSource: source,
          resolved: checkedOut.resolved,
          strategy,
        });
        addedSkills.push({
          name: discoveredName,
          status: "added",
          source: canonicalSource,
          requested: checkedOut.requestedRef,
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
          { label: "source", value: source },
          { label: "requested", value: checkedOut.requestedRef },
        ],
        skills: addedSkills,
      };
    }

    const fetched = await fetchSkillToTempDir(
      {
        source: parsedSource,
        requestedRef,
        requestedRefExplicit: options.ref !== undefined,
        githubBaseUrl: env.SKM_GITHUB_BASE_URL,
      },
      tempRoot,
    );
    const integrity = await hashDirectory(fetched.skillDir);
    const storeDir = await storeSkill(scope.storeDir, fetched.skillDir, integrity);
    const resolvedName = validateCanonicalName(canonicalName ?? parsedSource.defaultName);
    const strategy = "wrap";
    manifest.skills[resolvedName] = {
      source,
      requested: fetched.requestedRef,
      strategy,
    };
    lockfile.skills[resolvedName] = {
      resolved: fetched.resolved,
      integrity,
    };
    await writeManifest(scope.manifestPath, manifest);
    await writeLockfile(scope.lockfilePath, lockfile);
    await materializeSkill({
      canonicalName: resolvedName,
      sourceDir: storeDir,
      generatedSkillsDir: scope.generatedSkillsDir,
      manifestSource: source,
      resolved: fetched.resolved,
      strategy,
    });
    return {
      kind: "summary",
      command: "add",
      scope: scope.kind,
      summary: `Added ${resolvedName} to ${scope.kind} scope`,
      details: [
        { label: "source", value: source },
        { label: "requested", value: fetched.requestedRef },
        { label: "strategy", value: strategy },
      ],
      skills: [
        {
          name: resolvedName,
          status: "added",
          source,
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
