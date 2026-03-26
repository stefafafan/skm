import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import {
  resolveCanonicalSkillPathResult,
  validateCanonicalNameResult,
} from "../src/shared/canonical-name.js";

test("validateCanonicalNameResult returns ok for a safe canonical name", () => {
  const result = validateCanonicalNameResult("review-code-quality");

  assert.equal(result.isOk(), true);
  assert.equal(result._unsafeUnwrap(), "review-code-quality");
});

test("validateCanonicalNameResult returns an err for an unsafe canonical name", () => {
  const result = validateCanonicalNameResult("../escape");

  assert.equal(result.isErr(), true);
  assert.match(result._unsafeUnwrapErr().message, /invalid canonical name/i);
  assert.equal(result._unsafeUnwrapErr().exitCode, 2);
});

test("resolveCanonicalSkillPathResult returns the joined path for a safe canonical name", () => {
  const result = resolveCanonicalSkillPathResult("/tmp/generated", "review-code-quality");

  assert.equal(result.isOk(), true);
  assert.equal(result._unsafeUnwrap(), path.join("/tmp/generated", "review-code-quality"));
});
