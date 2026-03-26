import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import { fetchSkillToTempDirResult } from "../src/sources/fetch-skill.js";
import { parseSourceResult } from "../src/sources/parse.js";
import { createSkillRepoFixture, createTempDir } from "./helpers/fixture.js";

test("parseSourceResult returns ok for a GitHub tree URL", () => {
  const parsed = parseSourceResult(
    "https://example.com/example/skills/tree/main/skills/hello-skill",
  );

  assert.equal(parsed.isOk(), true);
  const value = parsed._unsafeUnwrap();
  assert.equal(value.kind, "github-tree");
  assert.equal(value.owner, "example");
  assert.equal(value.repo, "skills");
  assert.equal(value.ref, "main");
  assert.equal(value.subpath, "skills/hello-skill");
  assert.equal(value.defaultName, "hello-skill");
});

test("parseSourceResult returns an err for an unsupported source", () => {
  const parsed = parseSourceResult("not a valid source");

  assert.equal(parsed.isErr(), true);
  assert.match(parsed._unsafeUnwrapErr().message, /unsupported source/i);
});

test("fetchSkillToTempDirResult returns ok for a valid source", async () => {
  const fixture = await createSkillRepoFixture();
  const tempRoot = await createTempDir("skm-fetch-");

  const parsedSource = parseSourceResult(
    "https://example.com/example/skills/tree/main/skills/hello-skill",
  );
  assert.equal(parsedSource.isOk(), true);

  const fetched = await fetchSkillToTempDirResult(
    {
      source: parsedSource._unsafeUnwrap(),
      requestedRef: "main",
      githubBaseUrl: fixture.remoteRoot,
    },
    tempRoot,
  );

  assert.equal(fetched.isOk(), true);
  const value = fetched._unsafeUnwrap();
  assert.equal(value.resolved, fixture.commit);
  assert.equal(value.requestedRef, "main");
  assert.equal(path.basename(value.skillDir), "hello-skill");
  await fixture.cleanup();
});

test("fetchSkillToTempDirResult returns an err for refs that begin with checkout options", async () => {
  const fixture = await createSkillRepoFixture();
  const tempRoot = await createTempDir("skm-fetch-");
  const parsedSource = parseSourceResult(
    "https://example.com/example/skills/tree/main/skills/hello-skill",
  );
  assert.equal(parsedSource.isOk(), true);

  const result = await fetchSkillToTempDirResult(
    {
      source: parsedSource._unsafeUnwrap(),
      requestedRef: "-binjected",
      githubBaseUrl: fixture.remoteRoot,
    },
    tempRoot,
  );

  assert.equal(result.isErr(), true);
  assert.match(result._unsafeUnwrapErr().message, /invalid git ref/i);
  await fixture.cleanup();
});
