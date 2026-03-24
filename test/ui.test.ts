import assert from "node:assert/strict";
import test from "node:test";

import type { CliResult } from "../src/output";
import { renderCliResultWithInk } from "../src/ui/render";

test("renderCliResultWithInk renders the built summary view through the compiled renderer path", async () => {
  const result: CliResult = {
    kind: "summary",
    command: "add",
    scope: "project",
    summary: "Added review-code-quality to project scope",
    details: [
      {
        label: "source",
        value: "https://github.com/stefafafan/skills/tree/main/skills/commit-message-writer",
      },
      { label: "requested", value: "main" },
    ],
    skills: [
      {
        name: "review-code-quality",
        requested: "main",
        resolved: "58c32674139a663bb3668c4d16b49f1daf3b5af2",
        status: "added",
      },
    ],
  };

  const output = await renderCliResultWithInk(result, { columns: 100 });

  assert.match(output, /\[ok\] add/i);
  assert.match(output, /scope: project/i);
  assert.match(output, /Added review-code-quality to project scope/);
  assert.match(output, /review-code-quality/);
  assert.match(output, /58c32674139a663bb3668c4d16b49f1daf3b5af2/);
});

test("renderCliResultWithInk renders list output through the compiled renderer path", async () => {
  const result: CliResult = {
    kind: "list",
    all: true,
    rows: [
      {
        name: "shared-skill",
        scope: "project",
        source: "https://github.com/stefafafan/skills/tree/main/skills/shared-skill",
        requested: "main",
        resolved: "abc123",
        effective: "active",
      },
      {
        name: "shared-skill",
        scope: "global",
        source: "https://github.com/stefafafan/skills/tree/main/skills/shared-skill",
        requested: "main",
        resolved: "abc123",
        effective: "overridden",
      },
    ],
  };

  const output = await renderCliResultWithInk(result, { columns: 100 });

  assert.match(output, /Installed skills/i);
  assert.match(output, /shared-skill/);
  assert.match(output, /project/);
  assert.match(output, /global/);
  assert.match(output, /active/);
  assert.match(output, /overridden/);
  assert.match(output, /showing project and global scopes/i);
});
