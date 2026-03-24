import assert from "node:assert/strict";
import test from "node:test";

import {
  SkmError,
  errSkm,
  fromSkmPromise,
  fromSkmThrowable,
  getErrorMessage,
  getErrorStderr,
  getSkmError,
  toSkmError,
} from "#src/errors.js";

test("getErrorMessage returns the message for Error instances", () => {
  assert.equal(getErrorMessage(new Error("boom")), "boom");
});

test("getErrorMessage falls back to String for non-Error values", () => {
  assert.equal(getErrorMessage("boom"), "boom");
});

test("getErrorStderr returns stderr when present", () => {
  assert.equal(getErrorStderr({ stderr: "fatal\n" }), "fatal\n");
});

test("getSkmError returns SkmError instances", () => {
  const error = new SkmError("boom", 2);
  assert.equal(getSkmError(error), error);
});

test("getSkmError ignores non-SkmError values", () => {
  assert.equal(getSkmError(new Error("boom")), undefined);
});

test("toSkmError preserves an existing SkmError", () => {
  const original = new SkmError("boom", 7);

  assert.equal(toSkmError(original), original);
});

test("errSkm preserves an SkmError exit code when passed directly", () => {
  const original = new SkmError("boom", 7);
  const result = errSkm(original);

  assert.equal(result.isErr(), true);
  assert.equal(result._unsafeUnwrapErr(), original);
  assert.equal(result._unsafeUnwrapErr().exitCode, 7);
});

test("toSkmError wraps unknown failures with a fallback message and exit code", () => {
  const wrapped = toSkmError("boom", {
    fallbackMessage: "unexpected failure",
    exitCode: 9,
  });

  assert.equal(wrapped.message, "unexpected failure: boom");
  assert.equal(wrapped.exitCode, 9);
});

test("fromSkmThrowable converts thrown errors into an err result", () => {
  const result = fromSkmThrowable(
    () => {
      throw new Error("bad input");
    },
    {
      fallbackMessage: "parse failed",
      exitCode: 2,
    },
  )();

  assert.equal(result.isErr(), true);
  assert.equal(result._unsafeUnwrapErr().message, "parse failed: bad input");
  assert.equal(result._unsafeUnwrapErr().exitCode, 2);
});

test("fromSkmPromise converts rejected promises into an err result", async () => {
  const result = await fromSkmPromise(Promise.reject(new Error("git exploded")), {
    fallbackMessage: "git failed",
    exitCode: 3,
  });

  assert.equal(result.isErr(), true);
  assert.equal(result._unsafeUnwrapErr().message, "git failed: git exploded");
  assert.equal(result._unsafeUnwrapErr().exitCode, 3);
});
