import { type InitOptions, resolveCliScope } from "../../cli/global-options.js";
import { buildHelpResult, buildVersionResult } from "../../cli/help.js";
import { readManifest } from "../../manifest/io.js";
import { initLockfile, initManifest } from "../../manifest/init.js";
import { type CliResult } from "../../output/cli-result.js";
import {
  findProjectRoot,
  globalScope,
  projectScope,
  resolveProjectOutputDir,
} from "../../scope/resolve-scope.js";
import { SkmError } from "../../shared/errors.js";

export async function runInitCommand(input: {
  cwd: string;
  env: NodeJS.ProcessEnv;
  options: InitOptions;
}): Promise<CliResult> {
  const { cwd, env, options } = input;
  if (options.version) {
    return buildVersionResult();
  }
  if (options.help) {
    return buildHelpResult("init");
  }

  const scope =
    resolveCliScope(options) === "global"
      ? globalScope(requiredHomeDir(env.HOME), env.XDG_CONFIG_HOME)
      : projectScope((await findProjectRoot(cwd)) ?? cwd);

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

  await initManifest(scope.manifestPath, Boolean(options.force), options.outputDir);
  await initLockfile(scope.lockfilePath, Boolean(options.force));
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
  if (!homeDir) {
    throw new SkmError("HOME is required to resolve scope", 2);
  }
  return homeDir;
}
