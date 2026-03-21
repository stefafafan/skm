import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { SkmError } from "./errors";

const execFileAsync = promisify(execFile);

export async function runGit(args: string[], cwd?: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    });
    return stdout;
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    const detail = execError.stderr?.trim() || execError.message;
    throw new SkmError(`git ${args.join(" ")} failed: ${detail}`, 3);
  }
}

export async function cloneAndCheckout(
  repoUrl: string,
  ref: string,
  targetDir: string,
): Promise<void> {
  await runGit(["clone", "--quiet", repoUrl, targetDir]);
  await runGit(["checkout", "--quiet", ref], targetDir);
}

export async function readHeadCommit(repoDir: string): Promise<string> {
  return (await runGit(["rev-parse", "HEAD"], repoDir)).trim();
}
