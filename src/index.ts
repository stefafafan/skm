import { readFile } from "node:fs/promises";
import path from "node:path";

import { validateCanonicalName } from "./canonical-name";
import cac from "cac";
import { runAddCommand } from "./commands/add";
import { runInitCommand } from "./commands/init";
import { runInspectCommand } from "./commands/inspect";
import { runInstallCommand } from "./commands/install";
import { runListCommand } from "./commands/list";
import { runRenameCommand } from "./commands/rename";
import { runRemoveCommand } from "./commands/remove";
import { runUpdateCommand } from "./commands/update";
import { getErrorMessage, SkmError, isSkmError } from "./errors";
import { renderCliResultAsText, type CliResult } from "./output";
import { renderCliResultWithInk } from "./ui/render";

type SharedOptions = {
  help: boolean;
  version: boolean;
};

type ScopeOptions = SharedOptions & {
  global?: boolean;
  project?: boolean;
};

type InitOptions = ScopeOptions & {
  force?: boolean;
  outputDir?: string;
};

type AddOptions = ScopeOptions & {
  as?: string;
  ref?: string;
};

type UpdateOptions = ScopeOptions & {
  force?: boolean;
};

type ListOptions = ScopeOptions & {
  all?: boolean;
};

type MainContext = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdoutIsTTY?: boolean;
  stdoutColumns?: number;
};

export async function main(argv: string[], context?: MainContext): Promise<number> {
  const cwd = context?.cwd ?? process.cwd();
  const env = context?.env ?? process.env;
  const stdoutIsTTY = context?.stdoutIsTTY ?? process.stdout.isTTY ?? false;
  const stdoutColumns = context?.stdoutColumns ?? process.stdout.columns;

  try {
    const output = await dispatch(argv, cwd, env);
    if (output) {
      const renderedOutput = stdoutIsTTY
        ? await renderCliResultWithInk(output, { columns: stdoutColumns })
        : renderCliResultAsText(output);
      process.stdout.write(renderedOutput.endsWith("\n") ? renderedOutput : `${renderedOutput}\n`);
    }
    return 0;
  } catch (error) {
    if (isSkmError(error)) {
      process.stderr.write(`${error.message}\n`);
      return error.exitCode;
    }
    if (isCacError(error)) {
      process.stderr.write(`${error.message}\n`);
      return 2;
    }
    process.stderr.write(`${getErrorMessage(error)}\n`);
    return 1;
  }
}

async function dispatch(argv: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<CliResult> {
  const cli = cac("skm");
  let execution: Promise<CliResult> | undefined;
  const setExecution = (result: CliResult | Promise<CliResult>) => {
    execution = Promise.resolve(result);
  };

  registerGlobalOptions(cli);

  cli.command("help [command]", "Show help for skm or a subcommand").action((command?: string) => {
    setExecution(buildHelpResult(command));
  });

  cli.command("version", "Print the current skm version").action((options: SharedOptions) => {
    if (options.version) {
      setExecution(buildVersionResult());
      return;
    }
    if (options.help) {
      setExecution(buildHelpResult("version"));
      return;
    }
    setExecution(buildVersionResult());
  });

  cli
    .command("init", "Initialize skm metadata")
    .option("--force", "Rewrite existing manifest and lockfile")
    .option("--output-dir <path>", "Configure where managed skills are materialized")
    .action((options: InitOptions) => {
      setExecution(runInit(cwd, env, options));
    });

  cli
    .command("add [source]", "Add a skill from an upstream source")
    .option("--as <name>", "Set the local skill name for single-skill imports")
    .option("--ref <ref>", "Override the requested branch, tag, or commit")
    .action((source: string | undefined, options: AddOptions) => {
      setExecution(runAdd(cwd, env, source, options));
    });

  cli
    .command("remove [name]", "Remove a managed skill")
    .action((name: string | undefined, options: ScopeOptions) => {
      setExecution(runRemove(cwd, env, name, options));
    });

  cli
    .command("rename [oldName] [newName]", "Rename a managed skill")
    .action((oldName: string | undefined, newName: string | undefined, options: ScopeOptions) => {
      setExecution(runRename(cwd, env, oldName, newName, options));
    });

  cli.command("install", "Reinstall all managed skills").action((options: ScopeOptions) => {
    setExecution(runInstall(cwd, env, options));
  });

  cli
    .command("update [name]", "Update one or all managed skills")
    .option("--force", "Refresh even when the requested ref is already a fixed commit")
    .action((name: string | undefined, options: UpdateOptions) => {
      setExecution(runUpdate(cwd, env, name, options));
    });

  cli
    .command("list", "List managed skills")
    .option("--all", "Show both project and global entries when available")
    .action((options: ListOptions) => {
      setExecution(runList(cwd, env, options));
    });

  cli
    .command("inspect [name]", "Inspect a managed skill")
    .action((name: string | undefined, options: ScopeOptions) => {
      setExecution(runInspect(cwd, env, name, options));
    });

  cli.parse(["node", "skm", ...normalizeDashPrefixedOptionValues(argv)], { run: true });

  if (execution) {
    return await execution;
  }

  const unknownGlobalOption = findUnknownGlobalOption(cli.options);
  if (unknownGlobalOption && !cli.args[0]) {
    throw new SkmError(formatUnknownOption(unknownGlobalOption), 2);
  }

  if (cli.options.version) {
    return buildVersionResult();
  }

  if (cli.options.help) {
    return buildHelpResult(typeof cli.args[0] === "string" ? cli.args[0] : undefined);
  }

  if (cli.args[0]) {
    throw new SkmError(`Unknown command: ${cli.args[0]}`, 2);
  }

  return buildHelpResult();
}

function registerGlobalOptions(cli: ReturnType<typeof cac>): void {
  cli.option("-h, --help", "Display help");
  cli.option("-v, --version", "Display version");
  cli.option("--project", "Use project scope");
  cli.option("--global", "Use global scope");
}

function normalizeDashPrefixedOptionValues(argv: string[]): string[] {
  const normalized: string[] = [];
  const optionsWithValues = new Set(["--as", "--output-dir", "--outputDir", "--ref"]);

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === undefined) {
      continue;
    }
    if (current === "--") {
      normalized.push(...argv.slice(index));
      break;
    }
    const next = argv[index + 1];
    if (
      current &&
      optionsWithValues.has(current) &&
      next &&
      /^-[^-]/.test(next)
    ) {
      normalized.push(`${current}=${next}`);
      index += 1;
      continue;
    }
    normalized.push(current);
  }

  return normalized;
}

async function runInit(
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: InitOptions,
): Promise<CliResult> {
  if (options.version) {
    return buildVersionResult();
  }
  if (options.help) {
    return buildHelpResult("init");
  }

  return runInitCommand({
    cwd,
    homeDir: env.HOME,
    xdgConfigHome: env.XDG_CONFIG_HOME,
    scope: resolveScope(options),
    force: Boolean(options.force),
    outputDir: options.outputDir,
  });
}

async function runAdd(
  cwd: string,
  env: NodeJS.ProcessEnv,
  source: string | undefined,
  options: AddOptions,
): Promise<CliResult> {
  if (options.version) {
    return buildVersionResult();
  }
  if (options.help) {
    return buildHelpResult("add");
  }
  if (!source) {
    throw new SkmError("Usage: skm add <source>", 2);
  }

  return runAddCommand({
    cwd,
    homeDir: env.HOME,
    xdgConfigHome: env.XDG_CONFIG_HOME,
    scope: resolveScope(options),
    source,
    canonicalName: options.as ? validateCanonicalName(options.as) : undefined,
    requestedRef: options.ref,
    githubBaseUrl: env.SKM_GITHUB_BASE_URL,
  });
}

async function runRemove(
  cwd: string,
  env: NodeJS.ProcessEnv,
  name: string | undefined,
  options: ScopeOptions,
): Promise<CliResult> {
  if (options.version) {
    return buildVersionResult();
  }
  if (options.help) {
    return buildHelpResult("remove");
  }
  if (!name) {
    throw new SkmError("Usage: skm remove <name>", 2);
  }

  return runRemoveCommand({
    cwd,
    homeDir: env.HOME,
    xdgConfigHome: env.XDG_CONFIG_HOME,
    scope: resolveScope(options),
    canonicalName: validateCanonicalName(name),
  });
}

async function runRename(
  cwd: string,
  env: NodeJS.ProcessEnv,
  oldName: string | undefined,
  newName: string | undefined,
  options: ScopeOptions,
): Promise<CliResult> {
  if (options.version) {
    return buildVersionResult();
  }
  if (options.help) {
    return buildHelpResult("rename");
  }
  if (!oldName || !newName) {
    throw new SkmError("Usage: skm rename <old-name> <new-name>", 2);
  }

  return runRenameCommand({
    cwd,
    homeDir: env.HOME,
    xdgConfigHome: env.XDG_CONFIG_HOME,
    scope: resolveScope(options),
    oldName: validateCanonicalName(oldName),
    newName: validateCanonicalName(newName),
  });
}

async function runInstall(
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: ScopeOptions,
): Promise<CliResult> {
  if (options.version) {
    return buildVersionResult();
  }
  if (options.help) {
    return buildHelpResult("install");
  }

  return runInstallCommand({
    cwd,
    homeDir: env.HOME,
    xdgConfigHome: env.XDG_CONFIG_HOME,
    scope: resolveScope(options),
    githubBaseUrl: env.SKM_GITHUB_BASE_URL,
  });
}

async function runUpdate(
  cwd: string,
  env: NodeJS.ProcessEnv,
  name: string | undefined,
  options: UpdateOptions,
): Promise<CliResult> {
  if (options.version) {
    return buildVersionResult();
  }
  if (options.help) {
    return buildHelpResult("update");
  }

  return runUpdateCommand({
    cwd,
    homeDir: env.HOME,
    xdgConfigHome: env.XDG_CONFIG_HOME,
    scope: resolveScope(options),
    canonicalName: name ? validateCanonicalName(name) : undefined,
    force: Boolean(options.force),
    githubBaseUrl: env.SKM_GITHUB_BASE_URL,
  });
}

async function runList(
  cwd: string,
  env: NodeJS.ProcessEnv,
  options: ListOptions,
): Promise<CliResult> {
  if (options.version) {
    return buildVersionResult();
  }
  if (options.help) {
    return buildHelpResult("list");
  }

  return runListCommand({
    cwd,
    homeDir: env.HOME,
    xdgConfigHome: env.XDG_CONFIG_HOME,
    scope: resolveScope(options),
    all: Boolean(options.all),
  });
}

async function runInspect(
  cwd: string,
  env: NodeJS.ProcessEnv,
  name: string | undefined,
  options: ScopeOptions,
): Promise<CliResult> {
  if (options.version) {
    return buildVersionResult();
  }
  if (options.help) {
    return buildHelpResult("inspect");
  }
  if (!name) {
    throw new SkmError("Usage: skm inspect <name>", 2);
  }

  return runInspectCommand({
    cwd,
    homeDir: env.HOME,
    xdgConfigHome: env.XDG_CONFIG_HOME,
    scope: resolveScope(options),
    canonicalName: validateCanonicalName(name),
  });
}

function resolveScope(options: ScopeOptions): "global" | "project" | undefined {
  if (options.global) {
    return "global";
  }
  if (options.project) {
    return "project";
  }
  return undefined;
}

function findUnknownGlobalOption(options: Record<string, unknown>): string | undefined {
  const knownGlobalOptions = new Set(["--", "global", "h", "help", "project", "v", "version"]);
  return Object.keys(options).find((name) => !knownGlobalOptions.has(name));
}

function formatUnknownOption(name: string): string {
  return `Unknown option \`${name.length > 1 ? `--${name}` : `-${name}`}\``;
}

function isCacError(error: unknown): error is Error {
  return error instanceof Error && error.constructor.name === "CACError";
}

function buildHelpResult(command?: string): CliResult {
  switch (command) {
    case "version":
      return {
        kind: "help",
        title: "skm version",
        usage: "skm version",
        sections: [{ title: "Aliases", lines: ["- --version", "- -v"] }],
      };
    case "add":
      return {
        kind: "help",
        title: "skm add",
        usage: "skm add <source> [--project|--global] [--as <name>] [--ref <ref>]",
        sections: [
          {
            title: "Sources",
            lines: [
              "- GitHub tree URL: https://github.com/<owner>/<repo>/tree/<ref>/<path>",
              "- GitHub repository shorthand: <owner>/<repo>",
              "- GitHub repository URL: https://github.com/<owner>/<repo>",
            ],
          },
          {
            title: "Options",
            lines: [
              "- --as <name>  Set the local skill name for single-skill imports",
              "- --ref <ref>  Override the requested branch, tag, or commit",
              "- --project    Use project scope",
              "- --global     Use global scope",
            ],
          },
        ],
      };
    case "init":
      return {
        kind: "help",
        title: "skm init",
        usage: "skm init [--project|--global] [--force] [--output-dir <path>]",
        sections: [
          {
            title: "Options",
            lines: [
              "- --project  Initialize project scope",
              "- --global   Initialize global scope",
              "- --force    Rewrite existing manifest and lockfile",
              "- --output-dir, --outputDir <path>  Configure where managed skills are materialized",
            ],
          },
        ],
      };
    case "remove":
      return {
        kind: "help",
        title: "skm remove",
        usage: "skm remove <name> [--project|--global]",
        sections: [{ title: "Options", lines: ["- --project", "- --global"] }],
      };
    case "rename":
      return {
        kind: "help",
        title: "skm rename",
        usage: "skm rename <old-name> <new-name> [--project|--global]",
        sections: [{ title: "Options", lines: ["- --project", "- --global"] }],
      };
    case "install":
      return {
        kind: "help",
        title: "skm install",
        usage: "skm install [--project|--global]",
        sections: [{ title: "Options", lines: ["- --project", "- --global"] }],
      };
    case "update":
      return {
        kind: "help",
        title: "skm update",
        usage: "skm update [name] [--project|--global] [--force]",
        sections: [
          {
            title: "Options",
            lines: [
              "- --project",
              "- --global",
              "- --force    Refresh even when the requested ref is already a fixed commit",
            ],
          },
        ],
      };
    case "list":
      return {
        kind: "help",
        title: "skm list",
        usage: "skm list [--project|--global] [--all]",
        sections: [
          {
            title: "Options",
            lines: [
              "- --all      Show both project and global entries when available",
              "- --project",
              "- --global",
            ],
          },
        ],
      };
    case "inspect":
      return {
        kind: "help",
        title: "skm inspect",
        usage: "skm inspect <name> [--project|--global]",
        sections: [{ title: "Options", lines: ["- --project", "- --global"] }],
      };
    default:
      return {
        kind: "help",
        title: "skm",
        usage: "skm <command>",
        sections: [
          {
            title: "Commands",
            lines: [
              "- init",
              "- add <source>",
              "- remove <name>",
              "- rename <old-name> <new-name>",
              "- install",
              "- update [name]",
              "- list",
              "- inspect <name>",
              "- version",
              "- help [command]",
            ],
          },
          {
            title: "Global options",
            lines: ["- --help, -h", "- --version, -v", "- --project", "- --global"],
          },
        ],
      };
  }
}

async function buildVersionResult(): Promise<CliResult> {
  return {
    kind: "version",
    version: await readPackageVersion(),
  };
}

let cachedPackageVersion: string | undefined;

async function readPackageVersion(): Promise<string> {
  if (cachedPackageVersion) {
    return cachedPackageVersion;
  }

  const packageJsonPath = path.resolve(__dirname, "..", "..", "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    version?: string;
  };
  if (!packageJson.version) {
    throw new SkmError(`Missing version in ${packageJsonPath}`, 1);
  }
  cachedPackageVersion = packageJson.version;
  return cachedPackageVersion;
}
