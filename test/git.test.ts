import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { cloneAndCheckoutResult, readHeadCommitResult, runGitResult } from "../src/platform/git.js";
import { createSkillRepoFixture } from "./helpers/fixture.js";

test("runGitResult returns ok for a successful git invocation", async () => {
  const fixture = await createSkillRepoFixture();

  const result = await runGitResult(["rev-parse", "HEAD"], fixture.workspaceRoot);

  assert.equal(result.isOk(), true);
  assert.equal(result._unsafeUnwrap().trim(), fixture.commit);
  await fixture.cleanup();
});

test("runGitResult returns an err for a failing git invocation", async () => {
  const fixture = await createSkillRepoFixture();

  const result = await runGitResult(["definitely-not-a-subcommand"], fixture.workspaceRoot);

  assert.equal(result.isErr(), true);
  assert.match(result._unsafeUnwrapErr().message, /git definitely-not-a-subcommand failed/i);
  assert.equal(result._unsafeUnwrapErr().exitCode, 3);
  await fixture.cleanup();
});

test("cloneAndCheckoutResult clones a repo and readHeadCommitResult trims the detached commit", async () => {
  const fixture = await createSkillRepoFixture();
  const cloneDir = path.join(fixture.workspaceRoot, "..", "clone");

  const cloneResult = await cloneAndCheckoutResult(
    path.join(fixture.remoteRoot, "example", "skills.git"),
    "main",
    cloneDir,
  );
  assert.equal(cloneResult.isOk(), true);

  const headResult = await readHeadCommitResult(cloneDir);
  assert.equal(headResult.isOk(), true);
  assert.equal(headResult._unsafeUnwrap(), fixture.commit);

  await fixture.cleanup();
});
