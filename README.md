# skm

`skm` is a small CLI for managing [Agent Skills](https://agentskills.io) for both project and global scopes.

> [!WARNING]
> This package is in beta. There may be breaking changes.

## Motivation

Agent Skills are convenient, but I have been wondering about the following two points:

1. How should I actually manage my skills? Which version of each skill did I just download?
2. I understand that agents check skill names for discovery--but each skill author uses different naming conventions. How can I organize them?

`skm` solves these problems by storing metadata of installed skills and having the ability to alias skills with your favorite names.

## Commands

- `skm init`
- `skm add <source>`
- `skm remove <name>`
- `skm rename <old-name> <new-name>`
- `skm install`
- `skm update [name]`
- `skm list`
- `skm inspect <name>`

Scope flags:

- `--project`
- `--global`

## Sources

Supported source formats:

- GitHub path to the skill directory:
  - `https://github.com/<owner>/<repo>/tree/<ref>/<path>`
- GitHub repository shorthand:
  - `<owner>/<repo>`
- GitHub repository URL:
  - `https://github.com/<owner>/<repo>`

Repo-wide imports discover every nested directory containing `SKILL.md`.

## Files

Project scope uses:

- `skills.json`
  - user-facing intent
- `skills.lock.json`
  - resolved commit and integrity data
- `.skm/`
  - internal state and stored contents
- `.agents/skills/`
  - materialized runtime-visible skills

The intended manifest-first flow is:

1. Change `skills.json` with `skm` commands or by editing it directly.
2. Run `skm install --project`.
3. Let `skills.lock.json` and `.agents/skills/` reconcile automatically.
