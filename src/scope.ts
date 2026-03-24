import path from "node:path";

import { fromSkmPromise, type SkmResultAsync, SkmError } from "#src/errors.js";
import { pathExists } from "#src/fs.js";
import { DEFAULT_OUTPUT_DIR, readManifest } from "#src/manifest.js";

export type ScopeKind = "global" | "project";

export type ScopePaths = {
  kind: ScopeKind;
  rootDir: string;
  outputBaseDir: string;
  manifestPath: string;
  lockfilePath: string;
  stateDir: string;
  storeDir: string;
  generatedSkillsDir: string;
};

export type ResolveScopeOptions = {
  cwd: string;
  homeDir?: string;
  explicitScope?: ScopeKind;
  allowCreateProject?: boolean;
  xdgConfigHome?: string;
};

export async function resolveScope(options: ResolveScopeOptions): Promise<ScopePaths> {
  const homeDir = options.homeDir ?? process.env.HOME;
  if (!homeDir) {
    throw new SkmError("HOME is required to resolve scope", 2);
  }

  if (options.explicitScope === "project") {
    const projectRoot =
      (await findProjectRoot(options.cwd)) ??
      (options.allowCreateProject ? options.cwd : undefined);
    if (!projectRoot) {
      throw new SkmError("Project scope requested but no skills.json was found", 2);
    }
    return resolveManifestOutputDir(projectScope(projectRoot));
  }

  if (options.explicitScope === "global") {
    return resolveManifestOutputDir(globalScope(homeDir, options.xdgConfigHome));
  }

  const discoveredProjectRoot = await findProjectRoot(options.cwd);
  if (discoveredProjectRoot) {
    return resolveManifestOutputDir(projectScope(discoveredProjectRoot));
  }
  return resolveManifestOutputDir(globalScope(homeDir, options.xdgConfigHome));
}

export function resolveScopeResult(options: ResolveScopeOptions): SkmResultAsync<ScopePaths> {
  return fromSkmPromise(resolveScope(options));
}

export async function findProjectRoot(startDir: string): Promise<string | undefined> {
  let currentDir = path.resolve(startDir);

  while (true) {
    if (await pathExists(path.join(currentDir, "skills.json"))) {
      return currentDir;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
}

export function globalScope(homeDir: string, xdgConfigHome?: string): ScopePaths {
  const configRoot = xdgConfigHome
    ? path.join(xdgConfigHome, "skm")
    : path.join(homeDir, ".config", "skm");
  return {
    kind: "global",
    rootDir: configRoot,
    outputBaseDir: homeDir,
    manifestPath: path.join(configRoot, "skills.json"),
    lockfilePath: path.join(configRoot, "skills.lock.json"),
    stateDir: configRoot,
    storeDir: path.join(configRoot, "store"),
    generatedSkillsDir: path.join(homeDir, ".agents", "skills"),
  };
}

export function projectScope(projectRoot: string): ScopePaths {
  return {
    kind: "project",
    rootDir: projectRoot,
    outputBaseDir: projectRoot,
    manifestPath: path.join(projectRoot, "skills.json"),
    lockfilePath: path.join(projectRoot, "skills.lock.json"),
    stateDir: path.join(projectRoot, ".skm"),
    storeDir: path.join(projectRoot, ".skm", "store"),
    generatedSkillsDir: path.join(projectRoot, ".agents", "skills"),
  };
}

async function resolveManifestOutputDir(scope: ScopePaths): Promise<ScopePaths> {
  if (!(await pathExists(scope.manifestPath))) {
    return scope;
  }

  let manifest;
  try {
    manifest = await readManifest(scope.manifestPath);
  } catch {
    return scope;
  }

  return {
    ...scope,
    generatedSkillsDir: resolveOutputDir(scope, manifest.outputDir),
  };
}

function resolveOutputDir(scope: ScopePaths, outputDir: string): string {
  const normalizedOutputDir = outputDir || DEFAULT_OUTPUT_DIR;
  if (scope.kind === "project") {
    return resolveProjectOutputDir(scope.rootDir, normalizedOutputDir);
  }

  return path.isAbsolute(normalizedOutputDir)
    ? normalizedOutputDir
    : path.resolve(scope.outputBaseDir, normalizedOutputDir);
}

export function resolveProjectOutputDir(projectRoot: string, outputDir: string): string {
  const normalizedOutputDir = outputDir || DEFAULT_OUTPUT_DIR;
  if (path.isAbsolute(normalizedOutputDir)) {
    throw new SkmError(
      "Project manifest outputDir must be a relative path inside the project root",
      2,
    );
  }

  const resolvedOutputDir = path.resolve(projectRoot, normalizedOutputDir);
  if (!isPathInside(projectRoot, resolvedOutputDir)) {
    throw new SkmError("Project manifest outputDir must stay inside the project root", 2);
  }

  return resolvedOutputDir;
}

function isPathInside(rootDir: string, targetDir: string): boolean {
  const relativePath = path.relative(rootDir, targetDir);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}
