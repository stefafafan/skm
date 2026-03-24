import assert from "node:assert/strict";
import test from "node:test";

import {
  SkmError,
  getErrorMessage,
  getErrorStderr,
  getSkmError,
} from "../src/errors.js";

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
