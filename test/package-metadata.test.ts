import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

test("package metadata is ready for manual public publish under @stefafafan/skm", async () => {
  const packageJsonPath = path.resolve(process.cwd(), "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    name?: string;
    private?: boolean;
    files?: string[];
    publishConfig?: { access?: string };
    repository?: { type?: string; url?: string };
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };

  assert.equal(packageJson.name, "@stefafafan/skm");
  assert.equal(packageJson.private, false);
  assert.deepEqual(packageJson.files, ["dist/src/**/*", "LICENSE", "README.md"]);
  assert.equal(packageJson.publishConfig?.access, "public");
  assert.equal(packageJson.repository?.type, "git");
  assert.equal(packageJson.repository?.url, "git+https://github.com/stefafafan/skm.git");
  assert.equal(packageJson.scripts?.lint, "oxlint src test");
  assert.equal(packageJson.scripts?.["lint:fix"], "oxlint --fix src test");
  assert.equal(packageJson.scripts?.format, "oxfmt --write .");
  assert.equal(packageJson.scripts?.["format:check"], "oxfmt --check .");
  assert.equal(packageJson.devDependencies?.oxlint !== undefined, true);
  assert.equal(packageJson.devDependencies?.oxfmt !== undefined, true);
});
