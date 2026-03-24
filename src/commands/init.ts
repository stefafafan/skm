import { SkmError } from "#src/errors.js";
import { readManifest, initLockfile, initManifest } from "#src/manifest.js";
import { type CliResult } from "#src/output.js";
import {
  findProjectRoot,
  globalScope,
  projectScope,
  resolveProjectOutputDir,
} from "#src/scope.js";

export async function runInitCommand(options: {
  cwd: string;
  homeDir?: string;
  xdgConfigHome?: string;
  scope?: "global" | "project";
  force: boolean;
  outputDir?: string;
}): Promise<CliResult> {
  const scope =
    options.scope === "global"
      ? globalScope(requiredHomeDir(options.homeDir), options.xdgConfigHome)
      : projectScope((await findProjectRoot(options.cwd)) ?? options.cwd);

  if (scope.kind === "project") {
    if (options.outputDir !== undefined) {
      resolveProjectOutputDir(scope.rootDir, options.outputDir);
    } else if (options.force) {
      let manifest;
      try {
        manifest = await readManifest(scope.manifestPath);
      } catch {
        // Keep init resilient when the existing manifest is missing or invalid JSON.
      }
      if (manifest) {
        resolveProjectOutputDir(scope.rootDir, manifest.outputDir);
      }
    }
  }

  await initManifest(scope.manifestPath, options.force, options.outputDir);
  await initLockfile(scope.lockfilePath, options.force);
  return {
    kind: "summary",
    command: "init",
    scope: scope.kind,
    summary: `Initialized ${scope.kind} manifest at ${scope.manifestPath}`,
    details: [
      { label: "manifest", value: scope.manifestPath },
      { label: "lockfile", value: scope.lockfilePath },
    ],
  } satisfies CliResult;
}

function requiredHomeDir(homeDir?: string): string {
  const resolvedHomeDir = homeDir ?? process.env.HOME;
  if (!resolvedHomeDir) {
    throw new SkmError("HOME is required to resolve scope", 2);
  }
  return resolvedHomeDir;
}
