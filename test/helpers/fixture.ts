import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export type CliResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type SkillRepoFixture = {
  readonly remoteRoot: string;
  readonly workspaceRoot: string;
  readonly commit: string;
  updateSkill(contents: { skillMd?: string; extraFiles?: Record<string, string> }): string;
  cleanup(): Promise<void>;
};

export type RepoSkillFile = {
  path: string;
  skillMd: string;
  extraFiles?: Record<string, string>;
};

export async function createTempDir(prefix: string): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(value, null, 2));
}

export function runCli(
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): CliResult {
  const baseEnv = { ...process.env };
  delete baseEnv.XDG_CONFIG_HOME;
  const result = spawnSync(
    process.execPath,
    [path.resolve(process.cwd(), "dist/src/cli.js"), ...args],
    {
      cwd: options.cwd,
      env: { ...baseEnv, ...options.env },
      encoding: "utf8",
    },
  );

  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

export async function createSkillRepoFixture(): Promise<SkillRepoFixture> {
  return createGitHubRepoFixture([
    {
      path: "skills/hello-skill",
      skillMd: [
        "---",
        "name: upstream-hello",
        "description: Upstream greeting skill",
        "---",
        "",
        "# Hello Skill",
        "",
        "Use this to greet people.",
        "",
      ].join("\n"),
      extraFiles: {
        "notes.txt": "hello notes\n",
      },
    },
  ]);
}

export async function createGitHubRepoFixture(
  skills: RepoSkillFile[],
  options?: { defaultBranch?: string },
): Promise<SkillRepoFixture> {
  const defaultBranch = options?.defaultBranch ?? "main";
  const root = await createTempDir("skm-repo-");
  const workspaceRoot = path.join(root, "workspace");
  const remoteRoot = path.join(root, "remotes");
  const ownerDir = path.join(remoteRoot, "example");
  const bareRepo = path.join(ownerDir, "skills.git");
  await mkdir(ownerDir, { recursive: true });
  for (const skill of skills) {
    const skillDir = path.join(workspaceRoot, skill.path);
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), skill.skillMd);
    for (const [relativePath, content] of Object.entries(skill.extraFiles ?? {})) {
      await writeFile(path.join(skillDir, relativePath), content);
    }
  }

  git(["init", "-b", defaultBranch], workspaceRoot);
  git(["config", "user.name", "cat"], workspaceRoot);
  git(["config", "user.email", "cat@example.com"], workspaceRoot);
  git(["add", "."], workspaceRoot);
  git(["commit", "-m", "initial"], workspaceRoot);
  git(["init", "--bare", bareRepo], root);
  git(["symbolic-ref", "HEAD", `refs/heads/${defaultBranch}`], bareRepo);
  git(["remote", "add", "origin", bareRepo], workspaceRoot);
  git(["push", "-u", "origin", defaultBranch], workspaceRoot);

  return {
    remoteRoot,
    workspaceRoot,
    commit: git(["rev-parse", "HEAD"], workspaceRoot).trim(),
    updateSkill(contents) {
      return updateFixtureRepo(workspaceRoot, contents, bareRepo);
    },
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

function updateFixtureRepo(
  workspaceRoot: string,
  contents: { skillMd?: string; extraFiles?: Record<string, string> },
  bareRepo: string,
): string {
  const skillDir = path.join(workspaceRoot, "skills", "hello-skill");
  if (contents.skillMd !== undefined) {
    writeFileSync(path.join(skillDir, "SKILL.md"), contents.skillMd);
  }
  if (contents.extraFiles !== undefined) {
    for (const [relativePath, content] of Object.entries(contents.extraFiles)) {
      const target = path.join(skillDir, relativePath);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
  }

  git(["add", "."], workspaceRoot);
  git(["commit", "-m", "update skill"], workspaceRoot);
  git(["push", "origin", "main"], workspaceRoot);
  const nextCommit = git(["rev-parse", "HEAD"], workspaceRoot).trim();
  assert.notEqual(nextCommit, "");
  assert.equal(git(["remote", "get-url", "origin"], workspaceRoot).trim(), bareRepo);
  return nextCommit;
}

function git(args: string[], cwd: string): string {
  const gitArgs = args[0] === "commit" ? ["-c", "commit.gpgsign=false", ...args] : args;
  const result = spawnSync("git", gitArgs, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "cat",
      GIT_AUTHOR_EMAIL: "cat@example.com",
      GIT_COMMITTER_NAME: "cat",
      GIT_COMMITTER_EMAIL: "cat@example.com",
    },
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}
