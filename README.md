# skm

`skm` is a small CLI for managing [Agent Skills](https://agentskills.io) for both project and global scopes.

> [!WARNING]
> This package is in beta. There may be breaking changes.

## Motivation

Agent Skills are convenient, but I have been wondering about the following two points:

1. How should I actually manage my skills? Which version of each skill did I just download?
2. I understand that agents check skill names for discovery--but each skill author uses different naming conventions. How can I organize them?

`skm` solves these problems by storing metadata of installed skills and having the ability to alias skills with your favorite names.

## Install

From npm:

```bash
pnpm add -g @stefafafan/skm
```

With `npx`:

```bash
npx @stefafafan/skm --help
```

From source:

```bash
pnpm install
pnpm build
node dist/src/cli.js --help
```

## Quick Start

Project scope:

```bash
skm init --project
skm add https://github.com/stefafafan/skills/tree/main/skills/commit-message-writer --project
skm list --project
skm inspect commit-message-writer --project
```

Without a global install:

```bash
npx @stefafafan/skm init --project
npx @stefafafan/skm list --project
```

Global scope:

```bash
skm init --global
skm add stefafafan/skills --global
skm list --all
```

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

When stdout is a TTY, `skm` renders richer command output with Ink. When output is piped or redirected, it falls back to plain text so scripting stays stable.

For command help:

```bash
skm --help
skm help add
skm add --help
```

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
