import { cac } from "cac";

export type SharedOptions = {
  help?: boolean;
  version?: boolean;
};

export type ScopeOptions = SharedOptions & {
  global?: boolean;
  project?: boolean;
};

export type InitOptions = ScopeOptions & {
  force?: boolean;
  outputDir?: string;
};

export type AddOptions = ScopeOptions & {
  as?: string;
  ref?: string;
};

export type UpdateOptions = ScopeOptions & {
  force?: boolean;
};

export type ListOptions = ScopeOptions & {
  all?: boolean;
};

export type MainContext = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdoutIsTTY?: boolean;
  stdoutColumns?: number;
};

export function registerGlobalOptions(cli: ReturnType<typeof cac>): void {
  cli.option("-h, --help", "Display help");
  cli.option("-v, --version", "Display version");
  cli.option("--project", "Use project scope");
  cli.option("--global", "Use global scope");
}

export function resolveCliScope(options: ScopeOptions): "global" | "project" | undefined {
  if (options.global) {
    return "global";
  }
  if (options.project) {
    return "project";
  }
  return undefined;
}

export function resolveScope(options: ScopeOptions): "global" | "project" | undefined {
  return resolveCliScope(options);
}
