import { readFile } from "node:fs/promises";

import { type CliResult } from "../output/cli-result.js";
import { SkmError } from "../shared/errors.js";

export function buildHelpResult(command?: string): CliResult {
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

export async function buildVersionResult(): Promise<CliResult> {
  return {
    kind: "version",
    version: await readPackageVersion(),
  };
}

let cachedPackageVersion: string | undefined;
const packageJsonUrl = new URL("../../../package.json", import.meta.url);

async function readPackageVersion(): Promise<string> {
  if (cachedPackageVersion) {
    return cachedPackageVersion;
  }

  const packageJson = JSON.parse(await readFile(packageJsonUrl, "utf8")) as {
    version?: string;
  };
  if (!packageJson.version) {
    throw new SkmError(`Missing version in ${packageJsonUrl.href}`, 1);
  }
  cachedPackageVersion = packageJson.version;
  return cachedPackageVersion;
}
