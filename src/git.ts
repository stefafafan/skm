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
  const commit = await resolveCheckoutCommit(targetDir, ref);
  await runGit(["checkout", "--quiet", "--detach", commit], targetDir);
}

export async function readHeadCommit(repoDir: string): Promise<string> {
  return (await runGit(["rev-parse", "HEAD"], repoDir)).trim();
}

async function resolveCheckoutCommit(repoDir: string, ref: string): Promise<string> {
  if (ref.startsWith("-")) {
    throw new SkmError(`Invalid git ref: ${ref}`, 3);
  }

  let lastError: SkmError | undefined;
  for (const candidate of [
    ref,
    `refs/tags/${ref}`,
    `refs/heads/${ref}`,
    `refs/remotes/origin/${ref}`,
  ]) {
    try {
      return (
        await runGit(["rev-parse", "--verify", "--end-of-options", `${candidate}^{commit}`], repoDir)
      ).trim();
    } catch (error) {
      lastError = error as SkmError;
    }
  }

  throw lastError ?? new SkmError(`Unable to resolve git ref: ${ref}`, 3);
}
