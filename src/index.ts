import { readFile } from "node:fs/promises";
import path from "node:path";

import { runAddCommand } from "./commands/add";
import { runInitCommand } from "./commands/init";
import { runInspectCommand } from "./commands/inspect";
import { runInstallCommand } from "./commands/install";
import { runListCommand } from "./commands/list";
import { runRenameCommand } from "./commands/rename";
import { runRemoveCommand } from "./commands/remove";
import { runUpdateCommand } from "./commands/update";
import { SkmError, isSkmError } from "./errors";
import { renderCliResultAsText, type CliResult } from "./output";
import { renderCliResultWithInk } from "./ui/render";

interface ParsedCli {
  command?: string;
  positional: string[];
  scope?: "global" | "project";
  all: boolean;
  force: boolean;
  help: boolean;
  version: boolean;
  alias?: string;
  ref?: string;
}

export async function main(
  argv: string[],
  context?: {
    cwd?: string;
    env?: NodeJS.ProcessEnv;
    stdoutIsTTY?: boolean;
    stdoutColumns?: number;
  },
): Promise<number> {
  const parsed = parseArgv(argv);
  const cwd = context?.cwd ?? process.cwd();
  const env = context?.env ?? process.env;
  const stdoutIsTTY = context?.stdoutIsTTY ?? process.stdout.isTTY ?? false;
  const stdoutColumns = context?.stdoutColumns ?? process.stdout.columns;

  try {
    const output = await dispatch(parsed, cwd, env);
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
    const unknown = error as Error;
    process.stderr.write(`${unknown.message}\n`);
    return 1;
  }
}

function parseArgv(argv: string[]): ParsedCli {
  const parsed: ParsedCli = {
    positional: [],
    all: false,
    force: false,
    help: false,
    version: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }
    if (token === "--global") {
      parsed.scope = "global";
      continue;
    }
    if (token === "--help" || token === "-h") {
      parsed.help = true;
      continue;
    }
    if (token === "--version" || token === "-v") {
      parsed.version = true;
      continue;
    }
    if (token === "--project") {
      parsed.scope = "project";
      continue;
    }
    if (token === "--all") {
      parsed.all = true;
      continue;
    }
    if (token === "--force") {
      parsed.force = true;
      continue;
    }
    if (token === "--as") {
      parsed.alias = argv[index + 1];
      index += 1;
      continue;
    }
    if (token === "--ref") {
      parsed.ref = argv[index + 1];
      index += 1;
      continue;
    }

    if (!parsed.command) {
      parsed.command = token;
      continue;
    }
    parsed.positional.push(token);
  }

  return parsed;
}

async function dispatch(
  parsed: ParsedCli,
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<CliResult> {
  if (parsed.command === "help") {
    return buildHelpResult(parsed.positional[0]);
  }
  if (parsed.version) {
    return buildVersionResult();
  }
  if (parsed.help) {
    return buildHelpResult(parsed.command);
  }
  if (!parsed.command) {
    return buildHelpResult();
  }

  const homeDir = env.HOME;
  const githubBaseUrl = env.SKM_GITHUB_BASE_URL;
  const xdgConfigHome = env.XDG_CONFIG_HOME;

  switch (parsed.command) {
    case "init":
      return runInitCommand({
        cwd,
        homeDir,
        xdgConfigHome,
        scope: parsed.scope,
        force: parsed.force,
      });
    case "add":
      if (!parsed.positional[0]) {
        throw new SkmError("Usage: skm add <source>", 2);
      }
      return runAddCommand({
        cwd,
        homeDir,
        xdgConfigHome,
        scope: parsed.scope,
        source: parsed.positional[0],
        canonicalName: parsed.alias,
        requestedRef: parsed.ref,
        githubBaseUrl,
      });
    case "remove":
      if (!parsed.positional[0]) {
        throw new SkmError("Usage: skm remove <name>", 2);
      }
      return runRemoveCommand({
        cwd,
        homeDir,
        xdgConfigHome,
        scope: parsed.scope,
        canonicalName: parsed.positional[0],
      });
    case "rename":
      if (!parsed.positional[0] || !parsed.positional[1]) {
        throw new SkmError("Usage: skm rename <old-name> <new-name>", 2);
      }
      return runRenameCommand({
        cwd,
        homeDir,
        xdgConfigHome,
        scope: parsed.scope,
        oldName: parsed.positional[0],
        newName: parsed.positional[1],
      });
    case "install":
      return runInstallCommand({
        cwd,
        homeDir,
        xdgConfigHome,
        scope: parsed.scope,
        githubBaseUrl,
      });
    case "update":
      return runUpdateCommand({
        cwd,
        homeDir,
        xdgConfigHome,
        scope: parsed.scope,
        canonicalName: parsed.positional[0],
        force: parsed.force,
        githubBaseUrl,
      });
    case "list":
      return runListCommand({
        cwd,
        homeDir,
        xdgConfigHome,
        scope: parsed.scope,
        all: parsed.all,
      });
    case "inspect":
      if (!parsed.positional[0]) {
        throw new SkmError("Usage: skm inspect <name>", 2);
      }
      return runInspectCommand({
        cwd,
        homeDir,
        xdgConfigHome,
        scope: parsed.scope,
        canonicalName: parsed.positional[0],
      });
    case "version":
      return buildVersionResult();
    default:
      throw new SkmError(`Unknown command: ${parsed.command}`, 2);
  }
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
        usage: "skm init [--project|--global] [--force]",
        sections: [
          {
            title: "Options",
            lines: [
              "- --project  Initialize project scope",
              "- --global   Initialize global scope",
              "- --force    Rewrite existing manifest and lockfile",
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
