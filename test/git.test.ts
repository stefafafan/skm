import assert from "node:assert/strict";
import test from "node:test";

import { runGitResult } from "../src/git.js";
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
