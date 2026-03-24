import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  errSkm,
  getErrorMessage,
  getErrorStderr,
  okSkm,
  unwrapOrThrow,
  type SkmError,
  type SkmResult,
} from "./errors.js";

const execFileAsync = promisify(execFile);

export async function runGit(args: string[], cwd?: string): Promise<string> {
  return unwrapOrThrow(await runGitResult(args, cwd));
}

export async function runGitResult(args: string[], cwd?: string): Promise<SkmResult<string>> {
  try {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    });
    return okSkm(stdout);
  } catch (error) {
    const detail = getErrorStderr(error)?.trim() || getErrorMessage(error);
    return errSkm(`git ${args.join(" ")} failed: ${detail}`, 3);
  }
}

export async function cloneAndCheckout(
  repoUrl: string,
  ref: string,
  targetDir: string,
): Promise<void> {
  unwrapOrThrow(await cloneAndCheckoutResult(repoUrl, ref, targetDir));
}

export async function cloneAndCheckoutResult(
  repoUrl: string,
  ref: string,
  targetDir: string,
): Promise<SkmResult<void>> {
  const cloneResult = await runGitResult(["clone", "--quiet", repoUrl, targetDir]);
  if (cloneResult.isErr()) {
    return errSkm(cloneResult.error);
  }
  const commitResult = await resolveCheckoutCommitResult(targetDir, ref);
  if (commitResult.isErr()) {
    return errSkm(commitResult.error);
  }
  const checkoutResult = await runGitResult(
    ["checkout", "--quiet", "--detach", commitResult.value],
    targetDir,
  );
  if (checkoutResult.isErr()) {
    return errSkm(checkoutResult.error);
  }
  return okSkm(undefined);
}

export async function readHeadCommit(repoDir: string): Promise<string> {
  return unwrapOrThrow(await readHeadCommitResult(repoDir));
}

export async function readHeadCommitResult(repoDir: string): Promise<SkmResult<string>> {
  const headResult = await runGitResult(["rev-parse", "HEAD"], repoDir);
  if (headResult.isErr()) {
    return errSkm(headResult.error);
  }
  return okSkm(headResult.value.trim());
}

async function resolveCheckoutCommitResult(
  repoDir: string,
  ref: string,
): Promise<SkmResult<string>> {
  if (ref.startsWith("-")) {
    return errSkm(`Invalid git ref: ${ref}`, 3);
  }

  let lastError: SkmError | undefined;
  for (const candidate of [
    ref,
    `refs/tags/${ref}`,
    `refs/heads/${ref}`,
    `refs/remotes/origin/${ref}`,
  ]) {
    const candidateResult = await runGitResult(
      ["rev-parse", "--verify", "--end-of-options", `${candidate}^{commit}`],
      repoDir,
    );
    if (candidateResult.isOk()) {
      return okSkm(candidateResult.value.trim());
    }
    lastError = candidateResult.error;
  }

  return errSkm(lastError ?? `Unable to resolve git ref: ${ref}`, 3);
}
