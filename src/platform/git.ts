import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { safeTry } from "neverthrow";

import {
  errSkm,
  getErrorMessage,
  getErrorStderr,
  okSkm,
  unwrapOrThrow,
  type SkmError,
  type SkmResult,
} from "../shared/errors.js";

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
  return safeTry<void, SkmError>(async function* () {
    yield* await runGitResult(["clone", "--quiet", repoUrl, targetDir]);
    const commit = yield* await resolveCheckoutCommitResult(targetDir, ref);
    yield* await runGitResult(["checkout", "--quiet", "--detach", commit], targetDir);
    return okSkm(undefined);
  });
}

export async function readHeadCommit(repoDir: string): Promise<string> {
  return unwrapOrThrow(await readHeadCommitResult(repoDir));
}

export async function readHeadCommitResult(repoDir: string): Promise<SkmResult<string>> {
  return safeTry<string, SkmError>(async function* () {
    const head = yield* await runGitResult(["rev-parse", "HEAD"], repoDir);
    return okSkm(head.trim());
  });
}

async function resolveCheckoutCommitResult(
  repoDir: string,
  ref: string,
): Promise<SkmResult<string>> {
  if (ref.startsWith("-")) {
    return errSkm(`Invalid git ref: ${ref}`, 3);
  }

  const [firstCandidate, ...fallbackCandidates] = [
    ref,
    `refs/tags/${ref}`,
    `refs/heads/${ref}`,
    `refs/remotes/origin/${ref}`,
  ] as const;

  const firstResult = await runGitResult(
    ["rev-parse", "--verify", "--end-of-options", `${firstCandidate}^{commit}`],
    repoDir,
  );
  if (firstResult.isOk()) {
    return okSkm(firstResult.value.trim());
  }

  let lastError: SkmError = firstResult.error;
  for (const candidate of fallbackCandidates) {
    const candidateResult = await runGitResult(
      ["rev-parse", "--verify", "--end-of-options", `${candidate}^{commit}`],
      repoDir,
    );
    if (candidateResult.isOk()) {
      return okSkm(candidateResult.value.trim());
    }
    lastError = candidateResult.error;
  }

  return errSkm(lastError);
}
