import assert from "node:assert/strict";
import test from "node:test";

import { main as entryMain } from "../src/index.js";
import { main as cliMain } from "../src/cli/main.js";

test("src/index exports main from the CLI entrypoint", () => {
  assert.equal(entryMain, cliMain);
});
