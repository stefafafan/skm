import assert from "node:assert/strict";
import test from "node:test";

import { storePathResult } from "../src/store.js";

test("storePathResult returns ok for a valid integrity value", () => {
  const result = storePathResult("/tmp/skm-store", "sha256-deadbeef");

  assert.equal(result.isOk(), true);
  assert.match(result._unsafeUnwrap(), /sha256-deadbeef$/);
});

test("storePathResult returns an err for a traversing integrity value", () => {
  const result = storePathResult("/tmp/skm-store", "../escape");

  assert.equal(result.isErr(), true);
  assert.match(result._unsafeUnwrapErr().message, /invalid integrity value/i);
  assert.equal(result._unsafeUnwrapErr().exitCode, 2);
});
