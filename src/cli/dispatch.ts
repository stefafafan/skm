import { cac } from "cac";

import { type CliResult } from "../output/cli-result.js";
import { SkmError } from "../shared/errors.js";
import { runAddCommand } from "../commands/add/command.js";
import { runInitCommand } from "../commands/init/command.js";
import { runInspectCommand } from "../commands/inspect/command.js";
import { runInstallCommand } from "../commands/install/command.js";
import { runListCommand } from "../commands/list/command.js";
import { runRemoveCommand } from "../commands/remove/command.js";
import { runRenameCommand } from "../commands/rename/command.js";
import { runUpdateCommand } from "../commands/update/command.js";
import { findUnknownGlobalOption, formatUnknownOption } from "../cli/errors.js";
import { registerGlobalOptions } from "./global-options.js";
import { buildHelpResult, buildVersionResult } from "./help.js";
import { normalizeDashPrefixedOptionValues } from "./normalize-argv.js";

export async function dispatch(
  argv: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<CliResult> {
  const cli = cac("skm");
  let execution: Promise<CliResult> | undefined;
  const setExecution = (result: CliResult | Promise<CliResult>) => {
    execution = Promise.resolve(result);
  };

  registerGlobalOptions(cli);
  registerDispatchCommands(cli, { cwd, env }, setExecution);

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

export function registerDispatchCommands(
  cli: ReturnType<typeof cac>,
  context: { cwd: string; env: NodeJS.ProcessEnv },
  setExecution: (result: CliResult | Promise<CliResult>) => void,
): void {
  const { cwd, env } = context;

  cli.command("help [command]", "Show help for skm or a subcommand").action((command?: string) => {
    setExecution(buildHelpResult(command));
  });

  cli.command("version", "Print the current skm version").action(() => {
    setExecution(buildVersionResult());
  });

  cli
    .command("init", "Initialize skm metadata")
    .option("--force", "Rewrite existing manifest and lockfile")
    .option("--output-dir <path>", "Configure where managed skills are materialized")
    .action((options) => {
      setExecution(runInitCommand({ cwd, env, options }));
    });

  cli
    .command("add [source]", "Add a skill from an upstream source")
    .option("--as <name>", "Set the local skill name for single-skill imports")
    .option("--ref <ref>", "Override the requested branch, tag, or commit")
    .action((source: string | undefined, options) => {
      setExecution(runAddCommand({ cwd, env, source, options }));
    });

  cli
    .command("remove [name]", "Remove a managed skill")
    .action((name: string | undefined, options) => {
      setExecution(runRemoveCommand({ cwd, env, name, options }));
    });

  cli
    .command("rename [oldName] [newName]", "Rename a managed skill")
    .action((oldName: string | undefined, newName: string | undefined, options) => {
      setExecution(runRenameCommand({ cwd, env, oldName, newName, options }));
    });

  cli.command("install", "Reinstall all managed skills").action((options) => {
    setExecution(runInstallCommand({ cwd, env, options }));
  });

  cli
    .command("update [name]", "Update one or all managed skills")
    .option("--force", "Refresh even when the requested ref is already a fixed commit")
    .action((name: string | undefined, options) => {
      setExecution(runUpdateCommand({ cwd, env, name, options }));
    });

  cli
    .command("list", "List managed skills")
    .option("--all", "Show both project and global entries when available")
    .action((options) => {
      setExecution(runListCommand({ cwd, env, options }));
    });

  cli
    .command("inspect [name]", "Inspect a managed skill")
    .action((name: string | undefined, options) => {
      setExecution(runInspectCommand({ cwd, env, name, options }));
    });
}
