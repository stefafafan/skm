import assert from "node:assert/strict";
import test from "node:test";

import { parseLockEntry, parseManifestEntry } from "../../src/manifest/parse.js";

test("parseManifestEntry rejects non-string source values", () => {
  assert.throws(
    () => parseManifestEntry("skills.json", "hello", { source: 42 }),
    /source must be a string/,
  );
});

test("parseManifestEntry rejects non-string requested values", () => {
  assert.throws(
    () => parseManifestEntry("skills.json", "hello", { source: "https://example.com", requested: 42 }),
    /requested must be a string/,
  );
});

test("parseManifestEntry rejects invalid strategies", () => {
  assert.throws(
    () => parseManifestEntry("skills.json", "hello", { source: "https://example.com", strategy: "zip" }),
    /strategy must be one of wrap, link, or copy/,
  );
});

test("parseLockEntry rejects non-string resolved values", () => {
  assert.throws(
    () => parseLockEntry("skills.lock.json", "hello", { resolved: 42, integrity: "sha256-deadbeef" }),
    /resolved must be a string/,
  );
});

test("parseLockEntry rejects non-string integrity values", () => {
  assert.throws(
    () => parseLockEntry("skills.lock.json", "hello", { resolved: "abc123", integrity: 42 }),
    /integrity must be a string/,
  );
});
