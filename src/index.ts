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
  if (!parsed.command) {
    throw new SkmError("Usage: skm <init|add|remove|rename|install|update|list|inspect>", 2);
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
    default:
      throw new SkmError(`Unknown command: ${parsed.command}`, 2);
  }
}
