import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { assertRegularFile, copyDirectory, removeIfExists } from "../platform/fs.js";
import { validateCanonicalName } from "../shared/canonical-name.js";
import { fromSkmPromise, type SkmResultAsync, SkmError } from "../shared/errors.js";
import { checkoutSourceRepo } from "./checkout.js";
import type { FetchSkillOptions, FetchedSkill } from "./types.js";

export function fetchSkillToTempDirResult(
  options: FetchSkillOptions,
  tempRoot?: string,
): SkmResultAsync<FetchedSkill> {
  return fromSkmPromise(fetchSkillToTempDir(options, tempRoot));
}

export async function fetchSkillToTempDir(
  options: FetchSkillOptions,
  tempRoot?: string,
): Promise<FetchedSkill> {
  if (options.source.kind !== "github-tree") {
    throw new SkmError(`Source ${options.source.raw} does not point to a single skill`, 2);
  }

  const workingRoot = tempRoot ?? (await mkdtemp(path.join(os.tmpdir(), "skm-fetch-")));
  const checkedOut = await checkoutSourceRepo(options, workingRoot);
  const resolvedTreeSource = checkedOut.resolvedTreeSource ?? options.source;
  const outputDir = path.join(workingRoot, validateCanonicalName(resolvedTreeSource.defaultName));
  const upstreamSkillDir = path.join(checkedOut.checkoutDir, resolvedTreeSource.subpath);
  const skillMdPath = path.join(upstreamSkillDir, "SKILL.md");
  await assertRegularFile(skillMdPath, `Skill source ${resolvedTreeSource.raw} SKILL.md`);

  await copyDirectory(upstreamSkillDir, outputDir);
  await removeIfExists(checkedOut.checkoutDir);

  return {
    skillDir: outputDir,
    resolved: checkedOut.resolved,
    requestedRef: checkedOut.requestedRef,
  };
}
