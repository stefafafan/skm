import assert from "node:assert/strict";
import test from "node:test";

import { renderCliResultAsText } from "../../src/output/render-text.js";

test("renderCliResultAsText renders list rows as tab-separated text", () => {
  assert.equal(
    renderCliResultAsText({
      kind: "list",
      all: false,
      rows: [{ name: "hello", scope: "project", source: "example/skills", effective: "active" }],
    }),
    "name\tscope\tsource\trequested\tresolved\teffective\nhello\tproject\texample/skills\t\t\tactive\n",
  );
});
